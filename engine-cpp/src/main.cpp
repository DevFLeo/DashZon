// DashZon engine — modulo C++ de busca e agregacao rapida.
//
// Contrato: recebe um JSON via stdin ({"cmd": "...", "records": [...], ...})
// e escreve um JSON de resultado em stdout. O Ruby (backend) eh o unico
// responsavel por falar com o banco; este binario so processa listas de
// registros ja carregadas em memoria, sem conhecer nenhum modulo especifico.
// Qualquer template (financas, fluxo de caixa, demandas, mapeamento...) usa
// os mesmos comandos genericos abaixo.
//
// Comandos:
//   aggregate  -> agrupa/filtra/soma um conjunto de registros
//   multi      -> varios "aggregate" sobre os mesmos registros (1 processo)
//   search     -> busca textual + filtros exatos
#include "json.hpp"
#include <iostream>
#include <sstream>
#include <map>
#include <algorithm>
#include <cctype>

using json::Value;

namespace {

std::string toLower(const std::string& s) {
    std::string r = s;
    std::transform(r.begin(), r.end(), r.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return r;
}

std::string valueAsString(const Value& v) {
    switch (v.type) {
        case json::Type::String: return v.str;
        case json::Type::Bool: return v.b ? "true" : "false";
        case json::Type::Number: {
            std::ostringstream os;
            v.dumpTo(os);
            return os.str();
        }
        default: return "";
    }
}

std::string fieldAsString(const Value& record, const std::string& field) {
    if (field.empty()) return "";
    auto v = record.find(field);
    return v ? valueAsString(*v) : "";
}

double fieldAsNumber(const Value& record, const std::string& field) {
    if (field.empty()) return 0.0;
    auto v = record.find(field);
    if (!v) return 0.0;
    if (v->isNumber()) return v->num;
    if (v->isString()) {
        try { return std::stod(v->str); } catch (...) { return 0.0; }
    }
    return 0.0;
}

std::vector<std::pair<std::string, std::string>> readFilters(const Value& opts) {
    std::vector<std::pair<std::string, std::string>> out;
    auto f = opts.find("filters");
    if (f && f->isObject()) {
        for (auto& kv : f->obj) {
            std::string v = valueAsString(kv.second);
            if (!v.empty()) out.emplace_back(kv.first, v);
        }
    }
    return out;
}

bool passesFilters(const Value& rec, const std::vector<std::pair<std::string, std::string>>& filters) {
    for (auto& f : filters) {
        if (fieldAsString(rec, f.first) != f.second) return false;
    }
    return true;
}

struct Acc {
    double sum = 0;
    long count = 0;
};

struct GroupAcc {
    Acc total;
    std::map<std::string, Acc> series;
};

// Opcoes (todas opcionais):
//   group_by        campo usado como chave de agrupamento
//   group_format    "mes" -> usa YYYY-MM de um campo data
//   series_by       campo que quebra cada grupo em series (ex.: entrada/saida)
//   value_field     campo numerico somado (sem ele, so contagem)
//   filters         {campo: valor} aplicados antes de agregar
//   sign_field      campo que define o sinal do valor...
//   negative_values ...e os valores dele que tornam o valor negativo (ex.: ["saida"])
Value aggregate(const Value* records, const Value& opts) {
    std::string groupBy = opts.getString("group_by");
    std::string groupFormat = opts.getString("group_format");
    std::string seriesBy = opts.getString("series_by");
    std::string valueField = opts.getString("value_field");
    std::string signField = opts.getString("sign_field");
    auto filters = readFilters(opts);

    std::vector<std::string> negatives;
    if (auto neg = opts.findArray("negative_values")) {
        for (auto& n : neg->arr) negatives.push_back(valueAsString(n));
    }

    std::vector<std::string> order;
    std::vector<std::string> seriesOrder;
    std::map<std::string, GroupAcc> groups;
    Acc grand;

    if (records) {
        for (auto& rec : records->arr) {
            if (!passesFilters(rec, filters)) continue;

            std::string key;
            if (groupBy.empty()) {
                key = "Total";
            } else {
                key = fieldAsString(rec, groupBy);
                if (groupFormat == "mes") key = key.size() >= 7 ? key.substr(0, 7) : "";
                if (key.empty()) key = "(vazio)";
            }

            double value = fieldAsNumber(rec, valueField);
            if (!signField.empty()) {
                std::string s = fieldAsString(rec, signField);
                if (std::find(negatives.begin(), negatives.end(), s) != negatives.end()) value = -value;
            }

            if (!groups.count(key)) order.push_back(key);
            auto& g = groups[key];
            g.total.count++;
            g.total.sum += value;
            grand.count++;
            grand.sum += value;

            if (!seriesBy.empty()) {
                std::string sk = fieldAsString(rec, seriesBy);
                if (sk.empty()) sk = "(vazio)";
                if (std::find(seriesOrder.begin(), seriesOrder.end(), sk) == seriesOrder.end()) seriesOrder.push_back(sk);
                auto& sa = g.series[sk];
                sa.count++;
                sa.sum += value;
            }
        }
    }

    if (groupFormat == "mes") std::sort(order.begin(), order.end());

    Value result = Value::makeArray();
    for (auto& key : order) {
        auto& g = groups[key];
        Value row = Value::makeObject();
        row.set("key", Value::makeString(key));
        row.set("count", Value::makeNumber(static_cast<double>(g.total.count)));
        row.set("sum", Value::makeNumber(g.total.sum));
        row.set("avg", Value::makeNumber(g.total.count ? g.total.sum / g.total.count : 0.0));
        if (!seriesBy.empty()) {
            Value s = Value::makeObject();
            for (auto& sk : seriesOrder) {
                auto it = g.series.find(sk);
                Value cell = Value::makeObject();
                cell.set("count", Value::makeNumber(it == g.series.end() ? 0.0 : static_cast<double>(it->second.count)));
                cell.set("sum", Value::makeNumber(it == g.series.end() ? 0.0 : it->second.sum));
                s.set(sk, std::move(cell));
            }
            row.set("series", std::move(s));
        }
        result.push(std::move(row));
    }

    Value seriesKeys = Value::makeArray();
    for (auto& sk : seriesOrder) seriesKeys.push(Value::makeString(sk));

    Value out = Value::makeObject();
    out.set("result", std::move(result));
    out.set("series_keys", std::move(seriesKeys));
    out.set("total_count", Value::makeNumber(static_cast<double>(grand.count)));
    out.set("total_sum", Value::makeNumber(grand.sum));
    out.set("total_avg", Value::makeNumber(grand.count ? grand.sum / grand.count : 0.0));
    return out;
}

Value runMulti(const Value& root) {
    auto records = root.findArray("records");
    Value results = Value::makeArray();
    if (auto queries = root.findArray("queries")) {
        for (auto& q : queries->arr) results.push(aggregate(records, q));
    }
    Value out = Value::makeObject();
    out.set("results", std::move(results));
    return out;
}

// Busca textual (case-insensitive, substring) em `text_fields` (ou em todos os
// campos texto do registro, se nao informado) + filtros exatos.
Value runSearch(const Value& root) {
    auto records = root.findArray("records");
    std::string q = toLower(root.getString("q"));
    auto filters = readFilters(root);

    std::vector<std::string> textFields;
    if (auto tf = root.findArray("text_fields")) {
        for (auto& f : tf->arr) textFields.push_back(valueAsString(f));
    }

    Value matched = Value::makeArray();
    if (records) {
        for (auto& rec : records->arr) {
            if (!passesFilters(rec, filters)) continue;
            if (!q.empty()) {
                bool hit = false;
                if (textFields.empty()) {
                    for (auto& kv : rec.obj) {
                        if (kv.second.isString() && toLower(kv.second.str).find(q) != std::string::npos) { hit = true; break; }
                    }
                } else {
                    for (auto& f : textFields) {
                        if (toLower(fieldAsString(rec, f)).find(q) != std::string::npos) { hit = true; break; }
                    }
                }
                if (!hit) continue;
            }
            matched.push(rec);
        }
    }

    double count = static_cast<double>(matched.arr.size());
    Value out = Value::makeObject();
    out.set("result", std::move(matched));
    out.set("count", Value::makeNumber(count));
    return out;
}

} // namespace

int main() {
    std::ostringstream buf;
    buf << std::cin.rdbuf();

    Value out;
    try {
        Value root = json::parse(buf.str());
        std::string cmd = root.getString("cmd");
        if (cmd == "aggregate") out = aggregate(root.findArray("records"), root);
        else if (cmd == "multi") out = runMulti(root);
        else if (cmd == "search") out = runSearch(root);
        else {
            out = Value::makeObject();
            out.set("error", Value::makeString("comando desconhecido: " + cmd));
        }
    } catch (const std::exception& e) {
        out = Value::makeObject();
        out.set("error", Value::makeString(std::string("erro ao processar entrada: ") + e.what()));
    }

    std::cout << out.dump() << std::endl;
    return 0;
}

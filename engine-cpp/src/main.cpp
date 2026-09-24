// DashZon engine — modulo C++ de busca e agregacao rapida.
//
// Contrato: recebe um JSON via stdin ({"cmd": "...", "records": [...], ...})
// e escreve um JSON de resultado em stdout. O Ruby (backend) eh o unico
// responsavel por falar com o SQLite; este binario so processa listas de
// registros ja carregadas em memoria — mantendo os dois lados desacoplados
// e o binario reutilizavel para qualquer tabela.
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
    std::transform(r.begin(), r.end(), r.begin(), [](unsigned char c) { return std::tolower(c); });
    return r;
}

std::string fieldAsString(const Value& record, const std::string& field) {
    if (field.empty()) return "";
    auto v = record.find(field);
    if (!v) return "";
    if (v->isString()) return v->str;
    if (v->isNumber()) {
        std::ostringstream os;
        v->dumpTo(os);
        return os.str();
    }
    return "";
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

struct Acc {
    double sum = 0;
    long count = 0;
};

// cmd "aggregate": agrupa `records` por `group_by` e soma/conta/tira media de `value_field`.
// Usado tanto pelos widgets do dashboard builder quanto por qualquer outra tela que precise
// de contagens rapidas sobre uma tabela.
Value runAggregate(const Value& root) {
    auto recordsPtr = root.findArray("records");
    std::string groupBy = root.getString("group_by");
    std::string valueField = root.getString("value_field");

    std::vector<std::string> order;
    std::map<std::string, Acc> groups;

    if (recordsPtr) {
        for (auto& rec : recordsPtr->arr) {
            std::string key = groupBy.empty() ? "Total" : fieldAsString(rec, groupBy);
            if (key.empty()) key = "(vazio)";
            if (!groups.count(key)) order.push_back(key);
            auto& acc = groups[key];
            acc.count++;
            acc.sum += fieldAsNumber(rec, valueField);
        }
    }

    Value result = Value::makeArray();
    for (auto& key : order) {
        auto& acc = groups[key];
        Value row = Value::makeObject();
        row.set("key", Value::makeString(key));
        row.set("count", Value::makeNumber(static_cast<double>(acc.count)));
        row.set("sum", Value::makeNumber(acc.sum));
        row.set("avg", Value::makeNumber(acc.count ? acc.sum / acc.count : 0.0));
        result.push(std::move(row));
    }

    Value out = Value::makeObject();
    out.set("result", std::move(result));
    out.set("total_count", Value::makeNumber(recordsPtr ? static_cast<double>(recordsPtr->arr.size()) : 0.0));
    return out;
}

// cmd "search": busca textual (titulo/descricao) + filtros exatos sobre `records`,
// devolvendo tambem uma contagem rapida por status (usado no kanban de demandas).
Value runSearch(const Value& root) {
    auto recordsPtr = root.findArray("records");
    std::string q = toLower(root.getString("q"));
    std::string statusFilter = root.getString("status");
    std::string etapaFilter = root.getString("etapa_fluxo");

    Value matched = Value::makeArray();
    std::map<std::string, long> byStatus;
    std::vector<std::string> statusOrder;

    if (recordsPtr) {
        for (auto& rec : recordsPtr->arr) {
            if (!statusFilter.empty() && fieldAsString(rec, "status") != statusFilter) continue;
            if (!etapaFilter.empty() && fieldAsString(rec, "etapa_fluxo") != etapaFilter) continue;
            if (!q.empty()) {
                std::string titulo = toLower(fieldAsString(rec, "titulo"));
                std::string desc = toLower(fieldAsString(rec, "descricao"));
                if (titulo.find(q) == std::string::npos && desc.find(q) == std::string::npos) continue;
            }
            matched.push(rec);
            std::string st = fieldAsString(rec, "status");
            if (!byStatus.count(st)) statusOrder.push_back(st);
            byStatus[st]++;
        }
    }

    Value byStatusObj = Value::makeObject();
    for (auto& st : statusOrder) byStatusObj.set(st, Value::makeNumber(static_cast<double>(byStatus[st])));

    double matchedCount = static_cast<double>(matched.arr.size());
    Value out = Value::makeObject();
    out.set("result", std::move(matched));
    out.set("count", Value::makeNumber(matchedCount));
    out.set("by_status", std::move(byStatusObj));
    return out;
}

// cmd "fluxo_summary": totais de entrada/saida/saldo, e quebras por mes e por categoria.
Value runFluxoSummary(const Value& root) {
    auto recordsPtr = root.findArray("records");
    double totalEntrada = 0, totalSaida = 0;

    struct Par { double entrada = 0, saida = 0; };
    std::map<std::string, Par> byMes;
    std::vector<std::string> mesOrder;
    std::map<std::string, Par> byCat;
    std::vector<std::string> catOrder;

    if (recordsPtr) {
        for (auto& rec : recordsPtr->arr) {
            std::string tipo = fieldAsString(rec, "tipo");
            double valor = fieldAsNumber(rec, "valor");
            std::string categoria = fieldAsString(rec, "categoria");
            if (categoria.empty()) categoria = "(sem categoria)";
            std::string data = fieldAsString(rec, "data");
            std::string mes = data.size() >= 7 ? data.substr(0, 7) : "(sem data)";

            if (tipo == "entrada") totalEntrada += valor;
            else if (tipo == "saida") totalSaida += valor;

            if (!byMes.count(mes)) mesOrder.push_back(mes);
            if (tipo == "entrada") byMes[mes].entrada += valor;
            else if (tipo == "saida") byMes[mes].saida += valor;

            if (!byCat.count(categoria)) catOrder.push_back(categoria);
            if (tipo == "entrada") byCat[categoria].entrada += valor;
            else if (tipo == "saida") byCat[categoria].saida += valor;
        }
    }

    std::sort(mesOrder.begin(), mesOrder.end());

    Value byMesArr = Value::makeArray();
    for (auto& mes : mesOrder) {
        Value row = Value::makeObject();
        row.set("mes", Value::makeString(mes));
        row.set("entrada", Value::makeNumber(byMes[mes].entrada));
        row.set("saida", Value::makeNumber(byMes[mes].saida));
        row.set("saldo", Value::makeNumber(byMes[mes].entrada - byMes[mes].saida));
        byMesArr.push(std::move(row));
    }

    Value byCatArr = Value::makeArray();
    for (auto& cat : catOrder) {
        Value row = Value::makeObject();
        row.set("categoria", Value::makeString(cat));
        row.set("entrada", Value::makeNumber(byCat[cat].entrada));
        row.set("saida", Value::makeNumber(byCat[cat].saida));
        byCatArr.push(std::move(row));
    }

    Value out = Value::makeObject();
    out.set("total_entrada", Value::makeNumber(totalEntrada));
    out.set("total_saida", Value::makeNumber(totalSaida));
    out.set("saldo", Value::makeNumber(totalEntrada - totalSaida));
    out.set("by_mes", std::move(byMesArr));
    out.set("by_categoria", std::move(byCatArr));
    return out;
}

} // namespace

int main() {
    std::ostringstream buf;
    buf << std::cin.rdbuf();
    std::string input = buf.str();

    Value out;
    try {
        Value root = json::parse(input);
        std::string cmd = root.getString("cmd");
        if (cmd == "aggregate") out = runAggregate(root);
        else if (cmd == "search") out = runSearch(root);
        else if (cmd == "fluxo_summary") out = runFluxoSummary(root);
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

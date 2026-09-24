#pragma once
// JSON minimalista (sem dependencias externas) usado apenas para o contrato
// stdin/stdout entre o backend Ruby e o motor de busca/agregacao em C++.
// Cobre soh o subconjunto de JSON que o backend realmente envia: objetos,
// arrays, strings, numeros, bool e null.
#include <string>
#include <vector>
#include <sstream>
#include <cctype>
#include <cstdio>

namespace json {

enum class Type { Null, Bool, Number, String, Array, Object };

class Value {
public:
    Type type = Type::Null;
    bool b = false;
    double num = 0;
    std::string str;
    std::vector<Value> arr;
    std::vector<std::pair<std::string, Value>> obj;

    Value() = default;

    static Value makeNull() { return Value(); }
    static Value makeBool(bool v) { Value r; r.type = Type::Bool; r.b = v; return r; }
    static Value makeNumber(double v) { Value r; r.type = Type::Number; r.num = v; return r; }
    static Value makeString(const std::string& v) { Value r; r.type = Type::String; r.str = v; return r; }
    static Value makeArray() { Value r; r.type = Type::Array; return r; }
    static Value makeObject() { Value r; r.type = Type::Object; return r; }

    bool isNull() const { return type == Type::Null; }
    bool isObject() const { return type == Type::Object; }
    bool isArray() const { return type == Type::Array; }
    bool isString() const { return type == Type::String; }
    bool isNumber() const { return type == Type::Number; }

    void set(const std::string& key, Value v) {
        for (auto& kv : obj) {
            if (kv.first == key) { kv.second = std::move(v); return; }
        }
        obj.emplace_back(key, std::move(v));
    }

    const Value* find(const std::string& key) const {
        for (auto& kv : obj) {
            if (kv.first == key) return &kv.second;
        }
        return nullptr;
    }

    std::string getString(const std::string& key, const std::string& def = "") const {
        auto v = find(key);
        return (v && v->isString()) ? v->str : def;
    }

    double getNumber(const std::string& key, double def = 0) const {
        auto v = find(key);
        return (v && v->isNumber()) ? v->num : def;
    }

    const Value* findArray(const std::string& key) const {
        auto v = find(key);
        return (v && v->isArray()) ? v : nullptr;
    }

    void push(Value v) { arr.push_back(std::move(v)); }

    std::string dump() const {
        std::ostringstream os;
        dumpTo(os);
        return os.str();
    }

    void dumpTo(std::ostringstream& os) const {
        switch (type) {
            case Type::Null:
                os << "null";
                break;
            case Type::Bool:
                os << (b ? "true" : "false");
                break;
            case Type::Number: {
                if (num == static_cast<long long>(num)) os << static_cast<long long>(num);
                else os << num;
                break;
            }
            case Type::String:
                escapeTo(os, str);
                break;
            case Type::Array: {
                os << '[';
                for (size_t i = 0; i < arr.size(); i++) {
                    if (i) os << ',';
                    arr[i].dumpTo(os);
                }
                os << ']';
                break;
            }
            case Type::Object: {
                os << '{';
                for (size_t i = 0; i < obj.size(); i++) {
                    if (i) os << ',';
                    escapeTo(os, obj[i].first);
                    os << ':';
                    obj[i].second.dumpTo(os);
                }
                os << '}';
                break;
            }
        }
    }

private:
    static void escapeTo(std::ostringstream& os, const std::string& s) {
        os << '"';
        for (unsigned char c : s) {
            switch (c) {
                case '"': os << "\\\""; break;
                case '\\': os << "\\\\"; break;
                case '\n': os << "\\n"; break;
                case '\r': os << "\\r"; break;
                case '\t': os << "\\t"; break;
                default:
                    if (c < 0x20) {
                        char buf[8];
                        std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                        os << buf;
                    } else {
                        os << static_cast<char>(c);
                    }
            }
        }
        os << '"';
    }
};

class Parser {
public:
    explicit Parser(const std::string& s) : s_(s), i_(0) {}

    Value parse() {
        skipWs();
        return parseValue();
    }

private:
    const std::string& s_;
    size_t i_;

    void skipWs() { while (i_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[i_]))) i_++; }
    char peek() const { return i_ < s_.size() ? s_[i_] : '\0'; }

    Value parseValue() {
        skipWs();
        char c = peek();
        if (c == '{') return parseObject();
        if (c == '[') return parseArray();
        if (c == '"') return Value::makeString(parseString());
        if (c == 't' || c == 'f') return parseBool();
        if (c == 'n') { i_ += 4; return Value::makeNull(); }
        return parseNumber();
    }

    Value parseObject() {
        Value v = Value::makeObject();
        i_++; // {
        skipWs();
        if (peek() == '}') { i_++; return v; }
        while (true) {
            skipWs();
            std::string key = parseString();
            skipWs();
            if (peek() == ':') i_++;
            Value val = parseValue();
            v.obj.emplace_back(key, std::move(val));
            skipWs();
            if (peek() == ',') { i_++; continue; }
            if (peek() == '}') { i_++; break; }
            break;
        }
        return v;
    }

    Value parseArray() {
        Value v = Value::makeArray();
        i_++; // [
        skipWs();
        if (peek() == ']') { i_++; return v; }
        while (true) {
            v.arr.push_back(parseValue());
            skipWs();
            if (peek() == ',') { i_++; continue; }
            if (peek() == ']') { i_++; break; }
            break;
        }
        return v;
    }

    std::string parseString() {
        std::string out;
        if (peek() != '"') return out;
        i_++;
        while (i_ < s_.size() && s_[i_] != '"') {
            char c = s_[i_++];
            if (c == '\\' && i_ < s_.size()) {
                char esc = s_[i_++];
                switch (esc) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'u': {
                        if (i_ + 4 <= s_.size()) {
                            int cp = static_cast<int>(std::stol(s_.substr(i_, 4), nullptr, 16));
                            i_ += 4;
                            if (cp < 0x80) {
                                out += static_cast<char>(cp);
                            } else if (cp < 0x800) {
                                out += static_cast<char>(0xC0 | (cp >> 6));
                                out += static_cast<char>(0x80 | (cp & 0x3F));
                            } else {
                                out += static_cast<char>(0xE0 | (cp >> 12));
                                out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                                out += static_cast<char>(0x80 | (cp & 0x3F));
                            }
                        }
                        break;
                    }
                    default: out += esc;
                }
            } else {
                out += c;
            }
        }
        if (i_ < s_.size()) i_++;
        return out;
    }

    Value parseBool() {
        if (s_.compare(i_, 4, "true") == 0) { i_ += 4; return Value::makeBool(true); }
        i_ += 5;
        return Value::makeBool(false);
    }

    Value parseNumber() {
        size_t start = i_;
        if (peek() == '-') i_++;
        while (i_ < s_.size()) {
            char c = s_[i_];
            if (std::isdigit(static_cast<unsigned char>(c)) || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i_++;
            else break;
        }
        return Value::makeNumber(std::stod(s_.substr(start, i_ - start)));
    }
};

inline Value parse(const std::string& s) {
    Parser p(s);
    return p.parse();
}

} // namespace json

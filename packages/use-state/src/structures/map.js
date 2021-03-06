
const isPlainObject = require('lodash.isplainobject');
const Collection = require('./collection');
const parseType = require('./parse-type');

class Map2 extends Collection {
  static _definition = {};// definition about the keys and their description(like type, default value)
  static _keys = [];// key's name array

  // addKey('key', Type)
  // addKey('key', [Type, {default: 1, length: 8}])
  // addKey('key', {subKey: Type, subKey2: [Type]})
  static addKey(keyName, keyDesc) {
    if (!keyName) return;

    let def;
    if (!isPlainObject(keyName)) {
      def = { [keyName]: keyDesc };
    } else {
      def = keyName;
    }

    Object.keys(def).forEach((key) => {
      if (this._keys.indexOf(key) < 0) this._keys.push(key);

      let desc = def[key];
      if (!Array.isArray(desc)) desc = [desc];
      else if (desc.length <= 0) throw new TypeError(`Type required of key ${key} in map`);

      const { type, Type, default: defaultValue, invalid } = parseType(desc[0]);
      if (invalid) throw new TypeError(`Invalid type ${type} of key ${key} in map`);

      this._definition[key] = { default: defaultValue, ...desc[1], Type, type };
    });
  }

  static derive(SubClass) {
    SubClass._definition = {};// eslint-disable-line no-underscore-dangle
    SubClass._keys = [];// eslint-disable-line no-underscore-dangle
    if (!SubClass.derive) SubClass.derive = this.derive;
  }

  init(options = {}) {
    super.init(options);
    const { value = {} } = options;

    // initiate
    this._data = {};
    this.keys().forEach((key) => {
      this._data[key] = this.parseInitKeyValue(key, value[key]);
    });
  }

  keys() {
    return this.constructor._keys;// eslint-disable-line no-underscore-dangle
  }

  has(key) {
    if (!key || typeof key !== 'string') return false;
    return this.constructor._definition.hasOwnProperty(key);// eslint-disable-line no-underscore-dangle, no-prototype-builtins
  }

  // normalize and validate the value
  validate(key, value) { // eslint-disable-line class-methods-use-this
    return value;
  }

  getKeyDefinition(key) {
    const desc = this.constructor._definition[key];// eslint-disable-line no-underscore-dangle
    if (!desc) return {};
    return desc;
  }

  writeKeyValue(key, value) {
    super.writeKeyValue(key, value);
    this._data = { ...this._data, [key]: value };
  }
}

function createMap(def) {
  class DerivedMap extends Map2 {
  }
  Map2.derive(DerivedMap);
  DerivedMap.addKey(def);
  def = null;

  return DerivedMap;
}

module.exports = { createMap, Map: Map2 };

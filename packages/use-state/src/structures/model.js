
const isPlainObject = require('lodash.isplainobject');
const { Map: Map2 } = require('./map');

const MODELS = {};// {<name>: <model>}

class Model extends Map2 {
  static _name = null;
  static _store = null;// the bound global store
  static records = null;// all records(instances) of this model, {id: record}

  static bindStore(store) {
    if (this._store && this._store !== store) throw new Error('Model already bound to other store');
    this._store = store;
  }

  static findById(id) {
    return this.records[id] || null;
  }

  static merge(records) {
    if (!this._store) throw new Error(`No bound store of model ${this._name}`);
    if (!records || records.length <= 0) return [];
    if (!Array.isArray(records)) records = [records];

    const Class = this;
    return records.map((record) => {
      if (!record) throw new Error('Require record in merge()');

      if (!(record instanceof Class)) {
        if (!isPlainObject(record)) {
          throw new TypeError('Require model instance or plain object in merge()');
        }
        if (!record.id) throw new Error('Require id in record');
        if (this.records[record.id]) {
          return this.records[record.id].update(record);
        } else {
          const instance = new Class({ store: this._store, value: record });
          this.records[record.id] = instance;
          return instance;
        }
      } else {
        const id = record.readKeyValue('id');
        if (this.records[id]) {
          return this.records[id].update(record);
        } else {
          this.records[record.id] = record;
          return record;
        }
      }
    });
  }

  static derive(SubClass) {
    Map2.derive(SubClass);

    SubClass._name = null;// eslint-disable-line no-underscore-dangle
    SubClass._store = null;// eslint-disable-line no-underscore-dangle
    SubClass.records = {};

    SubClass.merge = this.merge;
    if (!SubClass.derive) SubClass.derive = this.derive;
  }

  init(options = {}) {
    const { value } = options;
    if (value && !value.id) throw new Error('Require non-empty id on initing');
    this.constructor.records[value.id] = this;

    super.init(options);
  }

  getId() {
    return this._data.id || null;
  }

  remove() {
    delete this.constructor.records[this._data.id];
  }

  writeKeyValue(key, value) {
    if (key === 'id') throw new Error('Can\'t change id value of model');
    super.writeKeyValue(key, value);
    this.constructor.records[this._data.id] = this;
  }
}
Map2.derive(Model);

function createModel(name, def) {
  if (!name) throw new Error('Require model name');
  if (MODELS[name]) {
    if (def) throw new Error(`Can't redefine model ${name}`);
    return MODELS[name];
  }

  class DerivedModel extends Model {

  }
  Model.derive(DerivedModel);
  DerivedModel.addKey(def);
  if (!def || !def.id) DerivedModel.addKey('id', String);
  DerivedModel._name = name;// eslint-disable-line no-underscore-dangle
  def = null;

  MODELS[name] = DerivedModel;

  return DerivedModel;
}

// test usage only
function clearModels() {
  Object.keys(MODELS).forEach(name => delete MODELS[name]);
}

module.exports = { createModel, Model, clearModels };

/*
 * Mongoose REST Query Plugin
 * **************************
 * An opinionated plugin for handling REST Queries in Mongoose
 * @author Olivier.dusabimana <diokey.olivier@gmail.com>, Twitter: @diokey
 * MIT License
 */

function filterPlugin(schema) {

  /*
   * options: {
   *   fields: [], // default: all,
   *   pagination: {
   *     page: 1 // default 0,
   *     size: 30 // default 30
   *   },
   *   filters: [], // filters: array, default [],
   *   sort: [], // sort properties default []
   *   embed: [] // embedded objects: It could be array, String, Object notation
   * }
   *
   */


  function isValidMongooseId(id) {
    return /^[a-fA-F0-9]{24}$/.test(id);
  }

  function parseFields(inputs) {
    return inputs.join(' ');
  }

  function parseEmbeded(props) {
    if (!props || !Array.isArray(props)) {
      throw new Error('Expected array of docs to populate');
    }

    if (!props) {
      return;
    }

    var docMap = {};
    var docum = {};
    docum.fields = [];

    props.forEach(function(prop) {
      var dotIndex = prop.indexOf('.');
      if (dotIndex === -1) {
        docum.doc = prop;
        docum.fields = null;
      } else {
        docum.doc = prop.substr(0, dotIndex);
        docum.fields.push(prop.substr(dotIndex + 1));
      }
      docMap[docum.doc] = docum;
    });

    var keys = Object.keys(docMap);
    return keys.map(function(key) {
      return docMap[key];
    });

  }

  function parseSort(inputs) {
    if (!inputs) {
      return;
    }
    var output = {};
    var key;
    var value;
    var sortSign;
    inputs.forEach(function(order) {
      key = '';
      value = '';
      sortSign = '';

      if (typeof order === 'string') {
        sortSign = order.substr(0,1);
        if (sortSign === '-') {
          key = order.substr(1);
          value = -1;
        } else {
          key = order;
          value = 1;
        }
        output[key] = value;
      } else if (typeof order === 'object') {
        key = Object.keys(order)[0];
        if (Number.isInteger(order[key])) {
          output[key] = order[key];
        } else {
          var sortOrder = order[key];
          switch (sortOrder) {
            case 'desc':
              output[key] = -1;
            break;
            case 'asc':
            case 'default':
              output[key] = 1;
          }
        }
      }
    });

    return output;
  }

  function parseFilters(inputs) {

    var filter = {};
    var regex;

    inputs.forEach(function(input) {
      switch (input.operator) {
        case '==':
          filter[input.key] = input.value;
        break;
        case '!=':
          filter[input.key] = {$ne: input.value};
        break;
        case '~':
          try {
            regex = new RegExp(input.value, 'i');
          } catch (err) {
            throw new Error('Invalid RegExp' + input.value);
          }
          if (regex) {
            filter[input.key] = regex;
          }
        break;
        case '!~':
          try {
            regex = new RegExp('^((?!' + input.value + ').)*$', 'i');
          } catch (err) {
            throw new Error('Invalid RegExp' + input.value);
          }
          if (regex) {
            filter[input.key] = regex;
          }
        break;
        case '<':
          filter[input.key] = {$lt: input.value};
        break;
        case '<=':
          filter[input.key] = {$lte: input.value};
        break;
        case '>':
          filter[input.key] = {$gt: input.value};
        break;
        case '>=':
          filter[input.key] = {$gte: input.value};
        break;
        case 'in':
          if (!Array.isArray(input.value)) {
            throw new Error('in operator requires an array of values');
          }
          filter[input.key] = {$in: input.value};
        break;
        case 'not in':
          if (!Array.isArray(input.value)) {
            throw new Error('not in Operator requires an array of values');
          }
          var notIn = {};
          notIn.$not = {$in: input.value};
          filter[input.key] = notIn;
        break;
        case 'between':
          if (!Array.isArray(input.value) || input.value.length !== 2) {
            throw new Error('Expected 2 values for between Operator');
          }
          filter[input.key] = {$gte: input.value[0], $lte: input.value[1]};
        break;
        case 'not between':
          if (!Array.isArray(input.value) || input.value.length !== 2) {
            throw new Error('Expected 2 values for not between Operator');
          }
          var lt = {};
          var gt = {};
          lt[input.key] = {$lt: input.value[0]};
          gt[input.key] = {$gt: input.value[1]};
          filter.$or = [lt , gt];
        break;
        default: throw new Error('Not Supported Operator' + input.operator);
      }
    });

    return filter;
  }

  schema.statics.filter = function(id, conditions, callback) {
    conditions = conditions || {};
    if (arguments.length < 3) {
      //Doc.filter(callback);
      if (typeof id === 'function') {
        // Doc.filter(callback)
        callback = id;
        conditions = {};
        id = undefined;
      } else {
        if (typeof conditions === 'function') {
          callback = conditions;
          if (id && !isValidMongooseId(id)) {
            //Doc.filter({}, callback);
            conditions = id;
            id = undefined;
          } else {
            //Doc.filter(123, callback);
            conditions = {};
          }
        } else {
          //Doc.filter(123);
          //Doc.filter({});
          if (id && !isValidMongooseId(id)) {
            conditions = id;
            id = undefined;
          }
        }
      }
    }

    conditions.fields           = conditions.fields || [];
    conditions.pagination       = conditions.pagination || {};
    conditions.pagination.page  = conditions.pagination.page || 1;
    conditions.pagination.size  = conditions.pagination.size || 30;
    conditions.filters          = conditions.filters || [];
    conditions.sort             = conditions.sort || [];
    conditions.embed            = conditions.embed || [];

    var query = null;
    var isCollection = !id;
    var identifier = conditions.indifier || {_id: id};

    if (!isCollection) {
      query = this.findOne(identifier);
    } else {
      if (!conditions.filters.length) {
        query = this.find();
      } else {
        var filters = parseFilters(conditions.filters);
        query = this.find(filters);
      }
    }

    if (conditions.fields) {
      var fields = parseFields(conditions.fields);
      query.select(fields);
    }

    if (conditions.embed) {
      var docs = parseEmbeded(conditions.embed);
      if (docs) {
        docs.forEach(function(doc) {
          if (doc.fields) {
            query.populate(doc.doc, doc.fields.join(' '));
          } else {
            query.populate(doc.doc);
          }
        });
      }
    }

    // sort only collections
    if (conditions.sort && isCollection) {
      var sortOrder = parseSort(conditions.sort);
      query.sort(sortOrder);
    }

    if (isCollection) {
      query.limit(conditions.pagination.size);
      var offset =
        (conditions.pagination.page - 1) * conditions.pagination.size;

      query.skip(offset);
    }

    if (!callback) {
      return query;
    } else {
      query.exec(callback);
    }

  };

}

module.exports = filterPlugin;

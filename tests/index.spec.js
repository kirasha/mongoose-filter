'use strict';

var should        = require('should'),
    mongoose      = require('mongoose'),
    Schema        = mongoose.Schema,
    FilterPlugin  = require('../');

var PermissionSchema = new Schema({
  name: {
    type: String,
    unique: true,
    required: 'Permission name is required'
  },
  description: String,
  active: {
    type: Boolean,
    default: true
  }
});

var Permission = mongoose.model('Permission', PermissionSchema);

var RoleSchema  = new Schema({
  name: {
    type: String,
    unique: true,
    required: 'Role name is required'
  },
  description: String,
  active: {
    type: Boolean,
    default: true
  },
  points: {
    type: Number,
    default: 0
  },
  permissions: [{
    type: Schema.Types.ObjectId, ref: 'Permission'
  }],
  created: {
    type: Date,
    default: new Date()
  }
});

RoleSchema.plugin(FilterPlugin);
var Role = mongoose.model('Role', RoleSchema);

function uniqueId() {
  var x = Math.random() * new Date().getUTCMilliseconds();
  var y = Math.random() * new Date().getUTCMilliseconds();
  var z = Math.random() * new Date().getUTCMilliseconds();
  var id = x * y / z;
  return id;
}

function createRole(name, description) {
  var points = Math.floor(uniqueId());
  var role = new Role({
    name: name,
    description: description,
    active: true,
    points: points
  });

  return role;
}

function createPermission(name, description) {
  var permission = new Permission({
      name: name,
      description: description,
      active: true
    });

  return permission;
}

function connectDB() {
  return new Promise(function(resolve, reject) {
    mongoose.connect('mongodb://localhost/mongoose-filter');
    mongoose.connection.on('error', function(err) {
      reject(err);
    });

    mongoose.connection.on('connected', function() {
      resolve();
    });

  });
}


function generatePermission(n) {
  n = n || 50;
  var i = 1;
  var promises = [];
  var promise;
  while (i <= n) {
    var suffix = uniqueId();
    var perm = createPermission('Permission ' + suffix,
                                'Permission Description ' + suffix);
    promise = perm.save();
    promises.push(promise);
    i++;
  }

  return Promise.all(promises);
}

function saveRole(permissions) {
  var suffix = uniqueId();
  var role = createRole('Role ' + suffix, 'Role Description ' + suffix);
  permissions.forEach(function(permission) {
    role.permissions.push(permission.id);
  });

  return role.save().then(function(r) {
    return r;
  });
}

function generateRole(n) {
  n = n || 50;
  var i = 1;
  var promise;
  var promises = [];

  while (i <= n) {
    promise = generatePermission(5).then(saveRole);
    promises.push(promise);
    i++;
  }
  return Promise.all(promises);
}

var allRoles = [];
function generateData() {
  return generateRole(10).then(function(roles) {
    allRoles = roles;
    console.log('Done generating ' + allRoles.length + ' Role');
  });
}

before(function(done) {
  connectDB()
  .then(Role.remove({}))
  .then(Permission.remove({}))
  .then(generateData)
  .then(done);
});

after(function(done) {
  mongoose.connection.db.dropDatabase();
  mongoose.connection.close(function() {
    done();
  });
});

describe('Mongoose Search Plugin', function() {
  it('should expose a static filter function', function(done) {
    Role.should.be.an.instanceOf(Object).and.have.property('filter');
    'function'.should.equal(typeof(Role.filter));
    done();
  });

  it('should match all rows if no parameter given', function(done) {
    Role.filter(function(err, roles) {
      should.not.exist(err);
      should.exist(roles);
      roles.length.should.equal(allRoles.length);
      done();
    });
  });

  it('should return a promise if no callback was passed', function(done) {
    Role.filter().then(function(roles) {
      should.exist(roles);
      roles.length.should.equal(allRoles.length);
      done();
    }).catch(done);
  });

  it('should return only paged result', function(done) {
    var options = {
      pagination: {
        page: 2,
        size: 3
      }
    };

    Role.filter(options).then(function(roles) {
      should.exist(roles);
      roles.length.should.equal(options.pagination.size);
      var firstExpectedItem = allRoles[options.pagination.size];
      var firstOutcomeItem = roles[0];
      firstExpectedItem.name.should.equal(firstOutcomeItem.name);
      done();
    });
  });

  it('should return only specified fields', function(done) {
    var options = {
      fields: ['name', 'description']
    };

    Role.filter(options).then(function(roles) {
      should.exist(roles);
      roles.length.should.equal(allRoles.length);
      var role = roles[0];
      role.should.have.properties(options.fields);
      should.not.exist(role.permissions);
      should.not.exist(role.active);
      done();
    });
  });

  function sortRoles() {
    return allRoles.concat().sort(function(a, b) {

      if (a.name === b.name) {
        if (a.description < b.description) {
          return 1;
        }
        if (a.description > b.description) {
          return -1;
        }
        return 0;
      }
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
    });
  }

  it('should sort on specified properties', function(done) {
    var options = {
      sort: ['name','-description']
    };

    Role.filter(options).then(function(roles) {
      should.exist(roles);
      var sortedRoles = sortRoles();
      sortedRoles[0].name.should.equal(roles[0].name);
      sortedRoles[sortedRoles.length - 1].name.should.equal(
        roles[roles.length - 1].name);
      done();
    });
  });

  it('should sort on specified properties given an object', function(done) {
    var options = {
      sort: [{'name': 'asc'},{'description': 'desc'}]
    };

    Role.filter(options).then(function(roles) {
      should.exist(roles);
      var sortedRoles = sortRoles();
      sortedRoles[0].name.should.equal(roles[0].name);
      sortedRoles[sortedRoles.length - 1].name.should.equal(
        roles[roles.length - 1].name);
      done();
    });
  });

  describe('filter feature', function() {
    it('should be able to filter on = Sign', function(done) {
      var role = allRoles[0];
      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: '==',
            value: role.name
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(1);
        roles[0].name.should.equal(role.name);
        done();
      });
    });

    it('should be able to filter on != Sign', function(done) {
      var role = allRoles[0];
      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: '!=',
            value: role.name
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(allRoles.length - 1);
        roles[0].name.should.not.equal(role.name);
        done();
      });
    });

    it('should be able to filter on ~ sign', function(done) {
      var role = allRoles[0];
      var roleName = role.name.split('.')[0];
      var similarRoles = allRoles.filter(function(role) {
        return role.name.split('.')[0] === roleName;
      });

      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: '~',
            value: roleName
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(similarRoles.length);
        done();
      });
    });

    it('should be able to filter on !~ sign', function(done) {
      var role = allRoles[0];
      var roleName = role.name.split('.')[0];
      var unlikeRoles = allRoles.filter(function(role) {
        return role.name.split('.')[0] !== roleName;
      });

      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: '!~',
            value: roleName
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(unlikeRoles.length);
        done();
      });
    });

    it('should be able to filter on < Sign', function(done) {
      var role1 = allRoles[2];
      var role2 = allRoles[5];
      var points = Math.max(role1.points, role2.points);
      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: '<',
            value: points
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.aboveOrEqual(1);
        var expected = roles[0].points < points;
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter on <= Sign', function(done) {
      var role1 = allRoles[2];
      var role2 = allRoles[5];
      var points = Math.max(role1.points, role2.points);
      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: '<=',
            value: points
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.aboveOrEqual(2);
        var expected = roles[0].points <= points;
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter on > Sign', function(done) {
      var role1 = allRoles[2];
      var role2 = allRoles[5];
      var points = Math.min(role1.points, role2.points);
      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: '>',
            value: points
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.aboveOrEqual(1);
        var expected = roles[roles.length - 1].points > points;
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter on >= Sign', function(done) {
      var role1 = allRoles[2];
      var role2 = allRoles[5];
      var points = Math.min(role1.points, role2.points);
      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: '>=',
            value: points
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.aboveOrEqual(2);
        var expected = roles[roles.length - 1].points >= points;
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter with "in" operator', function(done) {
      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: 'in',
            value: [allRoles[0].name, allRoles[4].name, allRoles[9].name]
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(3);
        done();
      });
    });

    it('should be able to filter with "not in" operator', function(done) {
      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: 'not in',
            value: [allRoles[0].name, allRoles[4].name, allRoles[9].name]
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.equal(allRoles.length - 3);
        done();
      });
    });

    it('should be able to filter with "between" operator', function(done) {

      var limitLeft = Math.min(allRoles[3].points, allRoles[6].points);
      var limitRight = Math.max(allRoles[3].points, allRoles[6].points);

      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: 'between',
            value: [limitLeft, limitRight]
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        roles.length.should.aboveOrEqual(2, 'Should return at least 2 roles');
        var expected = (roles[0].points >= limitLeft && roles[0].points <= limitRight);
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter with "not between" operator', function(done) {

      var limitLeft = Math.min(allRoles[3].points, allRoles[6].points);
      var limitRight = Math.max(allRoles[3].points, allRoles[6].points);

      var filterObject = {
        'filters': [
          {
            key: 'points',
            operator: 'not between',
            value: [limitLeft, limitRight]
          }
        ]
      };

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        var expected = (roles[0].points < limitLeft || roles[0].points > limitRight);
        expected.should.equal(true);
        done();
      });
    });

    it('should be able to filter even with multiple filters', function(done) {

      var limitLeft = Math.min(allRoles[3].points, allRoles[6].points);
      var limitRight = Math.max(allRoles[3].points, allRoles[6].points);

      var filterObject = {
        'filters': [
          {
            key: 'name',
            operator: '~',
            value: 'Role 1'
          },
          {
            key: 'points',
            operator: 'between',
            value: [limitLeft, limitRight]
          }
        ]
      };

      var expectedResult = allRoles.filter(function(role) {
        var regex = new RegExp(filterObject.filters[0].value);
        return (role.points >= limitLeft &&
                role.points <= limitRight &&
                regex.test(role.name));
      });

      Role.filter(filterObject).then(function(roles) {
        should.exist(roles);
        expectedResult.length.should.equal(roles.length);
        done();
      });
    });

  });

  var expectedDocument;

  describe('Embed documents', function() {
    it('should populate specified documents', function(done) {
      var embeded = ['permissions'];

      Role.filter({'embed': embeded}, function(err, roles) {
        should.exist(roles);
        roles[0].should.have.property('permissions');
        var permissions = roles[0].permissions;
        permissions.should.be.an.Array();
        var permission = permissions[0];
        permission.should.have.properties(['name','description','active']);
        done();
      });
    });

    it('should populate only fields specified in the documents', function(done) {
      var embeded = ['permissions.name','permissions.description'];

      Role.filter({'embed': embeded}, function(err, roles) {
        should.exist(roles);
        roles[0].should.have.property('permissions');
        expectedDocument = roles[0];
        var permissions = roles[0].permissions;
        permissions.should.be.an.Array();
        var permission = permissions[0];
        permission.should.have.properties(['name','description']);
        permission.toJSON().should.not.have.properties(['active']);
        done();
      });
    });
  });

  describe('Single documents', function() {
    it('should find a single document given an id', function(done) {
      Role.filter(expectedDocument._id).then(function(role) {
        should.exist(role);
        role.should.be.Object();
        expectedDocument._id.should.deepEqual(role._id);
        expectedDocument.name.should.equal(role.name);
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('should embed fields specified in the documents', function(done) {
      var embeded = ['permissions.name','permissions.description'];
      Role.filter(expectedDocument._id, {'embed': embeded})
      .then(function(role) {
        should.exist(role);
        role.should.be.Object();
        role.should.have.properties(Object.keys(expectedDocument));
        role.permissions[0].toJSON().should.deepEqual(
          expectedDocument.permissions[0].toJSON());
        done();
      }).catch(function(err) {
        done(err);
      });
    });
  });

});


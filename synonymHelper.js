const fs = require('fs');
const readline = require('readline')

function SynonymHelper(databaseConnector) {

  if (databaseConnector) {
    this.databaseConnector = databaseConnector;
  }
  else {
    var DatabaseConnector = require("./databaseConnector");
    this.databaseConnector = new DatabaseConnector();
  }

  // TODO add license somewhere

  this.getSynonyms = function(term, callback) {
    // TODO normalise term
    // get synonyms from database, i.e. retrieve the term's sense id and then get other words in this group
    if (this.databaseConnector.isConnected()) {
      this.databaseConnector.getSynonyms(term, function(err, result) {
        if (result && result.length > 0) {
          var synonyms = [];
          result.forEach(function(d) {
            if (synonyms.indexOf(d.term) == -1 && d.term != term) {
              synonyms.push(d.term.replace("_", " "));
            }
          });
          callback(synonyms);
        }
        else {
          callback([]);
        }
      });
    }

  }


  this.initDatabase = function(callback) {
    // read file
    // collection synonyms
    // add each line

    var that = this;


    fs.readFile('./synonyms/senses.json', 'utf8', function(err, data) {
      if (err) {
        return console.log(err);
      }

      var fileData = JSON.parse(data);
      that.databaseConnector.connect(function() {
        that.databaseConnector.clearCollection("synonyms");
        that.databaseConnector.insertDocumentsIntoCollection(fileData, "synonyms", callback);
      });
    });
  }

};

SynonymHelper.prototype = {
  getSynonyms : function() {
    return this.getSynonyms();
  },
  initDatabase : function() {
    return this.initDatabase();
  }
};

module.exports = SynonymHelper;

// TEST
// var synonymHelper = new SynonymHelper();
// synonymHelper.initDatabase();
//
// setTimeout(function() {
//   synonymHelper.getSynonyms("zone");
// }, 3000);

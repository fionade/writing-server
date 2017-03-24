const fs = require('fs');
var KeywordContextExtractor = require('./keywordExtractor2');

function TypingToolHelper(databaseConnector) {
  this.keywordContextExtractor = new KeywordContextExtractor();
  this.databaseConnector = databaseConnector;
};

TypingToolHelper.prototype.addFile = function addFile(folder, filename, callback) {
  var that = this;
  fs.readFile(folder + "/" + filename, 'utf8', function(err, data) {
    if (err) {
      return console.log(err);
    }

    that.keywordContextExtractor.addDocument(data, filename, "en");
    callback();

  });
}

TypingToolHelper.prototype.getFileNames = function getFileNames(directory) {
  var that = this;
  fs.readdir(directory, (err, files) => {
    if (err) {
      return console.log(err);
    }

    var itemsProcessed = 0;
    files.forEach(file => {
      this.addFile(directory, file, function() {
        itemsProcessed++;
        if (itemsProcessed >= files.length) {
          // once all files have been processed, the results can be used
          that.getKeywords();
          var contexts = that.keywordContextExtractor.getKeywordContexts();

          that.storeKeywordsInDatabase(contexts);
        }
      });
    });
  });
}

TypingToolHelper.prototype.storeKeywordsInDatabase = function storeKeywordsInDatabase(keywordDict) {

    var that = this;

    // for each key in the dict
    // create a "document" with the term, the left parts, and the right parts
    // and store it in the database (collection contexts)
    Object.keys(keywordDict).forEach(function (key) {
        var document = {
          'term' : key,
          'leftParts' : keywordDict[key].leftParts,
          'rightParts' : keywordDict[key].rightParts,
          'variations' : keywordDict[key].variations
        };

        that.databaseConnector.insertDocumentIntoCollection(document, 'context');
    });

}


TypingToolHelper.prototype.getKeywords = function getKeywords(){
  this.keywordContextExtractor.processCollection();

	var keywords = this.keywordContextExtractor.getCollectionKeywords();

	keywords = keywords
            .sort(function(k1, k2){
                if(k1.tf_idf < k2.tf_idf) return 1;
                if(k1.tf_idf > k2.tf_idf) return -1;
                return 0;
            });
  return keywords;

}


/*TypingToolHelper.prototype.saveKeywords = function saveKeywords() {

}

TypingToolHelper.prototype.clearKeywords = function clearKeywords() {
  // TODO remove keywords from database
}*/

module.exports = TypingToolHelper;

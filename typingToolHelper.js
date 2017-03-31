const fs = require('fs');
var KeywordContextExtractor = require('./keywordExtractor2');

function TypingToolHelper(databaseConnector, keywordExtractor) {
  this.keywordContextExtractor = keywordExtractor;
  this.databaseConnector = databaseConnector;
};

TypingToolHelper.prototype.addFile = function addFile(metadata, callback) {
  var that = this;
  fs.readFile(metadata.path, 'utf8', function(err, data) {
    if (err) {
      return console.log(err);
    }

    that.keywordContextExtractor.addDocument(data, metadata.title, "en", metadata);
    callback();

  });
}

TypingToolHelper.prototype.getFileNames = function getFileNames(directory) {
  var that = this;
  // fs.readdir(directory, (err, files) => {
  //   if (err) {
  //     return console.log(err);
  //   }
  //
  //   var itemsProcessed = 0;
  //   files.forEach(file => {
  //     this.addFile(directory, file, function() {
  //       itemsProcessed++;
  //       if (itemsProcessed >= files.length) {
  //         // once all files have been processed, the results can be used
  //         that.getKeywords();
  //         var contexts = that.keywordContextExtractor.getKeywordContexts();
  //
  //         that.storeKeywordsInDatabase(contexts);
  //       }
  //     });
  //   });
  // });

  fs.readFile('./text_files/metadata.json', 'utf8', function(err, data) {
    if (err) {
      return console.log(err);
    }

    var fileData = JSON.parse(data);

    var itemsProcessed = 0;
    fileData.files.forEach(function(d) {
      that.addFile(d, function() {
        itemsProcessed++;
        if (itemsProcessed >= fileData.files.length) {
          // once all files have been processed, the results can be used
          that.getKeywords();
          var contexts = that.keywordContextExtractor.getKeywordContexts();

          that.storeKeywordsInDatabase(contexts);
        }
      });
    });

  //   { files:
  //  [ { path: 'Deep_learning.txt',
  //      title: 'Deep Learning',
  //      authors: 'Wikipedia',
  //      url: 'https://en.wikipedia.org/wiki/Deep_Learning' },
  //    { path: 'machine_learning.txt',
  //      title: 'Machine Learning',
  //      authors: 'Wikipedia',
  //      url: 'https://en.wikipedia.org/wiki/Machine_Learning' } ] }

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

const natural = require('natural');
const pos = require('pos');
const _ = require('underscore');

var STR_UNDEFINED = 'undefined';

// REFERENCE adapting Cecilia's code to my needs
// I removed the nested functions in KeywordExtractor() {, notably the "constructor"
// private functions var -> this.
// prototype gets an export statement below: module.exports = KeywordContextExtractor;

// TODO remove the version in index.js, but check first what changes I made for that

function KeywordContextExtractor() {
  var _this,
      s = {},
      stemmer, tokenizer, nounInflector, tfidf, stopWords, lexer, tagger,
      POS = {
          NN: 'NN',           // singular noun
          NNS: 'NNS',         // plural noun
          NNP: 'NNP',         // proper noun
          JJ: 'JJ'            // adjective
      };

    s = {
        minDocFrequency: 1,
        minRepetitionsInDocument: 3,
        maxKeywordDistance: 5,
        minRepetitionsProxKeywords: 2,
        multiLingualEnabled : false
    };

    _this = this;
    this.collection = [];
    this.documentKeywords = [];
    this.collectionKeywords = [];
    this.collectionKeywordsDict = {};

    this.keywordContexts = {};

    stemmer = natural.PorterStemmer; //natural.LancasterStemmer;
    stemmer.attach();
    tokenizer = new natural.WordTokenizer;
    nounInflector = new natural.NounInflector();
    nounInflector.attach();
    tfidf = new natural.TfIdf(),
    stopWords = natural.stopwords;
    lexer = new pos.Lexer();
    tagger = new pos.Tagger();


/************************************************************************************************************************************
*
*   PRIVATE METHODS
*
************************************************************************************************************************************/


  this.extractDocumentKeywords = function(collection) {

      //POS tagging
      collection.forEach(function(d, i) {
          d.taggedWords = tagger.tag(lexer.lex(d.text));
      });

      // Find out which adjectives are potentially important and worth keeping
      var keyAdjectives = this.getKeyAdjectives(collection);

      // Create each item's document to be processed by tf*idf
      collection.forEach(function(d) {
          d.language = "en";
          d.tokens = _this.getFilteredTokens(d.taggedWords, keyAdjectives);                                       // d.tokens contains raw nouns and important adjectives
          tfidf.addDocument(d.tokens.map(function(term){ return term.stem(); }).join(' '));                 // argument = string of stemmed terms in document array
      });

      // Save keywords for each document
      var documentKeywords = [];
      collection.forEach(function(d, i){
          documentKeywords.push(_this.getDocumentKeywords(i));
      });

      return documentKeywords;
  };


  this.getKeyAdjectives = function(_collection) {

      var candidateAdjectives = [],
          keyAdjectives = [];

      _collection.forEach(function(d, i) {
          // Find out which adjectives are potentially important and worth keeping
          d.taggedWords.forEach(function(tw){
              if(tw[1] == 'JJ'){
                  var adjIndex = _.findIndex(candidateAdjectives, function(ca){ return ca.adj === tw[0].toLowerCase() });
                  if(adjIndex == -1)
                      candidateAdjectives.push({ 'adj': tw[0].toLowerCase(), 'repeated': 1 });
                  else
                      candidateAdjectives[adjIndex].repeated++;
              }
          });
      });

      candidateAdjectives.forEach(function(ca){
          if(ca.repeated >= parseInt(_collection.length * 0.5))
              keyAdjectives.push(ca.adj);
      });
      return keyAdjectives;
  }

  // Filter out meaningless words, keeping only nouns (plurals are singularized) and key adjectives
  this.getFilteredTokens = function(taggedWords, keyAdjectives) {
      var filteredTerms = [];
      taggedWords.forEach(function(tw){
          switch(tw[1]){
              case POS.NN:          // singular noun
                  tw[0] = (tw[0].isAllUpperCase()) ? tw[0] : tw[0].toLowerCase();
                  filteredTerms.push(tw[0]); break;
              case POS.NNS:         // plural noun
                  filteredTerms.push(tw[0].toLowerCase().singularizeNoun());
                  break;
              case POS.NNP:         // proper noun
                  tw[0] = (tagger.wordInLexicon(tw[0].toLowerCase())) ? tw[0].toLowerCase().singularizeNoun() : tw[0];
                  filteredTerms.push(tw[0]); break;
              case POS.JJ:
                  if(keyAdjectives.indexOf(tw[0]) > -1)
                      filteredTerms.push(tw[0]); break;
          }
      });
      return filteredTerms;
  }


  this.getDocumentKeywords = function(dIndex) {
      var docKeywords = {};

      tfidf.listTerms(dIndex).forEach(function(item){
          if(isNaN(item.term) && parseFloat(item.tfidf) > 0 )
              docKeywords[item.term] = item.tfidf;
      });
      return docKeywords;
  }


  /////////////////////////////////////////////////////////////////////////////

  this.extractCollectionKeywords = function(collection, documentKeywords, minDocFrequency) {

      minDocFrequency = minDocFrequency ? minDocFrequency : s.minDocFrequency;
      var keywordDict = this.getKeywordDictionary(collection, documentKeywords, minDocFrequency);

      // get keyword variations (actual terms that match the same stem)
      collection.forEach(function(d){
          d.tokens.forEach(function(token){
              var stem = token.stem();
              //var stem = multiLingualService.stem(token, d.language);
              if(keywordDict[stem] && /*!multiLingualService.isTokenStopword(token, d.language) */stopWords.indexOf(token.toLowerCase()) == -1)
                  keywordDict[stem].variations[token] =
                      keywordDict[stem].variations[token] ? keywordDict[stem].variations[token] + 1 : 1;
          });
      });

      // compute keywords in proximity
      keywordDict = this.computeKeywordsInProximity(collection, keywordDict);
      var collectionKeywords = [];

      _.keys(keywordDict).forEach(function(keyword){
          // Put keywords in proximity in sorted array
          var proxKeywords = [];
          _.keys(keywordDict[keyword].keywordsInProximity).forEach(function(proxKeyword){
              var proxKeywordsRepetitions = keywordDict[keyword].keywordsInProximity[proxKeyword];
              if(proxKeywordsRepetitions >= s.minRepetitionsProxKeywords)
                  proxKeywords.push({ stem: proxKeyword, repeated: proxKeywordsRepetitions });
          });
          keywordDict[keyword].keywordsInProximity = proxKeywords.sort(function(proxK1, proxK2){
              if(proxK1.repeated < proxK2.repeated) return 1;
              if(proxK1.repeated > proxK2.repeated) return -1;
              return 0;
          });

          // get human-readable term for each stem key in the dictionary
          keywordDict[keyword].term = _this.getRepresentativeTerm(keywordDict[keyword]);

          // store each key-value in an array
          collectionKeywords.push(keywordDict[keyword]);
      });

      // sort keywords in array by document frequency
      collectionKeywords = collectionKeywords
          //.filter(function(ck){ return ck.repeated >= minRepetitions })
          .sort(function(k1, k2){
              if(k1.repeated < k2.repeated) return 1;
              if(k1.repeated > k2.repeated) return -1;
              return 0;
          });

/*        collectionKeywords.forEach(function(k, i){
          if(_.keys(k.variations).length == 0) {
              console.log(k);
              var ii = _.findIndex(collection, function(d){ return d.id == k.inDocument[0]; });
              console.log(collection[ii]);
          }
          k.term = getRepresentativeTerm(k);
      });*/

/*        console.log('dictionary');
      console.log(keywordDict);
      console.log('array');
      console.log(collectionKeywords);*/

      return { array: collectionKeywords, dict: keywordDict };
  };



  this.getKeywordDictionary = function(_collection, _documentKeywords, _minDocFrequency) {

      var keywordDict = {};
      _documentKeywords.forEach(function(docKeywords, i){

          _.keys(docKeywords).forEach(function(stemmedTerm){
              if(!keywordDict[stemmedTerm]) {
                  keywordDict[stemmedTerm] = {
                      stem: stemmedTerm,
                      term: '',
                      repeated: 1,
                      variations: {},
                      inDocument : [_collection[i].id],
                      keywordsInProximity: {},
                      tf_idf: docKeywords[stemmedTerm]
                  };
              }
              else {
                  keywordDict[stemmedTerm].repeated++;
                  keywordDict[stemmedTerm].inDocument.push(_collection[i].id);
              }
          });
      });

      _.keys(keywordDict).forEach(function(keyword){
          if(keywordDict[keyword].repeated < _minDocFrequency)
              delete keywordDict[keyword];
      });
      return keywordDict;
  };

  this.extractKeywordContexts = function(_collection, _documentKeywords) {

    var keywordContexts = {};

    function containsToken(array, term, startIndex) {
      // terms with less than three characters will not be regarded
      if (term.length < 3) {
        return -1;
      }
      term = term.toLowerCase();
      for (var i = startIndex; i < array.length; i++) {
        // include all words that start with the term and have no more than 3 characters behind it
        if (array[i].toLowerCase().startsWith(term) && (array[i].length - term.length) < 4) {
          return i;
        }
      }
      return -1;
    }

    _collection.forEach(function(d, i){
        var text = d.text.replace("\n", " ");
        var allTokens = text.split(" ");
        // TODO only useful tokens, not word parts
        Object.keys(_documentKeywords[i]).forEach(function(token) {
          var leftParts = [];
          var rightParts = [];
          var variations = [];
          var i = -1;
          while((i = containsToken(allTokens, token, i + 1)) != - 1) {
            leftParts.push(allTokens.slice(Math.max(0, i - 10), i));
            rightParts.push(allTokens.slice(i + 1, Math.min(allTokens.length, i + 10)));
            // the variations are also needed to build proper sentences afterwards
            variations.push(allTokens[i]);
          }

          if (keywordContexts[token]) {
            keywordContexts[token].leftParts = keywordContexts[token].leftParts.concat(leftParts);
            keywordContexts[token].rightParts = keywordContexts[token].rightParts.concat(rightParts);
            keywordContexts[token].variations = keywordContexts[token].variations.concat(variations);
          }
          else {
            keywordContexts[token] = {
              'leftParts' : leftParts,
              'rightParts' : rightParts,
              'variations' : variations
            };
          }
        });
    });

    return keywordContexts;

  }

  this.getMatchesForKeywords = function(keywords) {

    var that = this;

    var scores = [];
    for (var i = 0; i < this.collection.length; i++) {
      scores.push({
        index : this.collection[i].id,
        score : 0,
        metadata : this.collection[i].metadata
      });
    }

    this.collection.forEach(function(d, i) {
      keywords.forEach(function(e) {
        if (that.documentKeywords[i][e]) {
          scores[i].score += that.documentKeywords[i][e];
        }
      });
    });

    // sort
    scores = scores.sort(function(k1, k2) {
      if (k1.score < k2.score) return 1;
      if (k1.score > k2.score) return -1;
      return 0;
    });

    return scores;

  }

  this.computeKeywordsInProximity = function(_collection, _keywordDict) {
      _collection.forEach(function(d){
          d.tokens.forEach(function(token, i, tokens){

              var current = token.stem();
              //var current = multiLingualService.stem(token, d.language);
              if(_keywordDict[current]) {   // current word is keyword

                  for(var j=i-s.maxKeywordDistance; j <= i+s.maxKeywordDistance; j++){
                      var prox = tokens[j] ? tokens[j].stem() : STR_UNDEFINED;
          //var prox = tokens[j] ? multiLingualService.stem(tokens[j], d.language) : STR_UNDEFINED;

                      if(_keywordDict[prox] && current != prox) {
                          //var proxStem = prox.stem();
                          _keywordDict[current].keywordsInProximity[prox] = _keywordDict[current].keywordsInProximity[prox] ? _keywordDict[current].keywordsInProximity[prox] + 1 : 1;
                      }
                  }
              }
          });
      });

      return _keywordDict;
  };


  this.getRepresentativeTerm = function(k){

      var keys = _.keys(k.variations);

      if(keys.length == 0)
          return 'ERROR';

      // Only one variations
      if(keys.length == 1)
          return keys[0];

      // 2 variations, one in lower case and the other starting in uppercase --> return in lower case
      if(keys.length == 2 && !keys[0].isAllUpperCase() && !keys[1].isAllUpperCase() && keys[0].toLowerCase() === keys[1].toLowerCase())
          return keys[0].toLowerCase();

      // One variation is repeated >= 75%
      var repetitions = 0;
      for(var i = 0; i < keys.length; ++i)
          repetitions += k.variations[keys[i]];

      for(var i = 0; i < keys.length; ++i)
          if(k.variations[keys[i]] >= parseInt(repetitions * 0.75))
              return keys[i];

      // One variation end in 'ion', 'ment', 'ism' or 'ty'
      for(var i = 0; i < keys.length; ++i)
          if(keys[i].match(/ion$/) || keys[i].match(/ment$/) || keys[i].match(/ism$/) || keys[i].match(/ty$/))
              return keys[i].toLowerCase();

      // One variation matches keyword stem
      if(k.variations[k.stem])
          return k.stem;

      // Pick shortest variation
      // but not less than 3 characters
      var shortestTerm = keys[0];

      var i = 1;
      while (shortestTerm.length < 3 && i < keys.length) {
        shortestTerm = keys[i++];
      }

      for(var i = 1; i < keys.length; i++){
          if(keys[i].length > 2 && keys[i].length < shortestTerm.length)
              shortestTerm = keys[i];
      }
      return shortestTerm.toLowerCase();
    };
};

KeywordContextExtractor.prototype = {
    addDocument: function(document, id, language, metadata) {
        document = (!Array.isArray(document)) ? document : document.join(' ');
        id = id || this.collection.length;
        language = language || "en";
        this.collection.push({ id: id, text: document, language: language, metadata: metadata });
    },
    processCollection: function() {
        tfidf = new natural.TfIdf();
        var timestamp = new Date().getTime();
        this.documentKeywords = this.extractDocumentKeywords(this.collection);
        this.keywordContexts = this.extractKeywordContexts(this.collection, this.documentKeywords);
        var collectionKeywords = this.extractCollectionKeywords(this.collection, this.documentKeywords);
        this.collectionKeywords = collectionKeywords.array;
        this.collectionKeywordsDict = collectionKeywords.dict;

        var miliseconds = new Date().getTime() - timestamp;
        var seconds = parseInt(miliseconds / 1000);
        console.log('Keyword extraction finished in ' + seconds + ' seconds, ' + miliseconds%1000 + ' miliseconds (=' + miliseconds + ' ms)');
    },
    listDocumentKeywords: function(index) {
        return this.documentKeywords[index];
    },
    getCollectionKeywords: function() {
        return this.collectionKeywords;
    },
    getCollectionKeywordsDictionary: function() {
        return this.collectionKeywordsDict;
    },
    getKeywordContexts: function() {
        return this.keywordContexts;
    },
    getMatchesForKeywords: function(keywords) {
        return this.getMatchesForKeywords(keywords);
    },
    clear: function() {
        tfidf = null;
        this.collection = [];
        this.documentKeywords = [];
        this.collectionKeywords = [];
        this.collectionKeywordsDict = {};
    }
};

module.exports = KeywordContextExtractor;

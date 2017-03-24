const restify = require('restify');
const natural = require('natural');
const pos = require('pos');
const _ = require('underscore');

var STR_UNDEFINED = 'undefined';

function respond(req, res, next) {
  res.send('hello ' + req.params.name);
  next();
}

function returnKeywords(request, response, next) {

	// deal with the specifics of the request
	// TODO: persistent object
	var text = request.body;
	text = text.replace(/\+|(%0A)+/g, " ");
	text = text.replace("text=", "");
	text = text.substring(5, text.length);
	var keywordExtractor = new KeywordExtractor();
	keywordExtractor.addDocument(/*request.body.*/text, 0, "en");

	//  Extract collection and document keywords
	keywordExtractor.processCollection();

	var keywords = keywordExtractor.getCollectionKeywords();

	keywords = keywords
            .sort(function(k1, k2){
                if(k1.tf_idf < k2.tf_idf) return 1;
                if(k1.tf_idf > k2.tf_idf) return -1;
                return 0;
            });

	response.send(keywords);
	next();
}

function saveActivity(request, response, next) {

	var body = JSON.parse(request.body);
	if (databaseConnector && databaseConnector.isConnected()) {
		databaseConnector.insertDocument(body.activity);
		// TODO status code
		response.send("Inserted document");
	}
	else {
		response.send(503, "Not connected to database");
	}
	next();
}

function saveActivityItems(request, response, next) {

	var body = JSON.parse(request.body);

	if (databaseConnector && databaseConnector.isConnected()) {
		databaseConnector.insertDocuments(body.activity);
		// TODO status code
		response.send("Inserted documents");
	}
	else {
		response.send(503, "Not connected to database");
	}

	next();

}

function getActivity(request, response, next) {

	// TODO: GET only, not POST?
	var body = JSON.parse(request.body);
	if (databaseConnector && databaseConnector.isConnected()) {
		// TODO security
		databaseConnector.getDocumentsForId(body.documentId, function(err, result) {
			response.send(200, result);
		});
		// TODO compile response

		// TODO iter
	}
	else {
		response.send(503, "Not connected to database");
	}

	next();
}

function retrieveContexts(request, response, next) {
  // TODO
  var keyword = request.params.keyword;

  if (databaseConnector && databaseConnector.isConnected()) {
    databaseConnector.getKeywordSurroundings(keyword, function(err, result) {
      response.send(200, result);
    });
  }
}

var server = restify.createServer();

server.use(restify.gzipResponse());
server.use(restify.bodyParser());

server.post({
	path: '/keywords'
}, returnKeywords);

server.post({
	path: '/activity'
}, saveActivity);

server.post({
	path: '/activityItems'
}, saveActivityItems);

server.post({
	path: '/getActivity'
}, getActivity);

server.get('/getContext/:keyword', retrieveContexts);

// set up database connection
var DatabaseConnector = require("./databaseConnector");
var databaseConnector = new DatabaseConnector();

databaseConnector.connect();

var TypingToolHelper = require("./typingToolHelper");
var typingToolHelper = new TypingToolHelper(databaseConnector);

typingToolHelper.getFileNames("./text_files");

// TODO
// databaseConnector.close();

// start listening
server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});


var KeywordExtractor = (function(){

    var _this,
        s = {},
        stemmer, tokenizer, nounInflector, tfidf, stopWords, lexer, tagger,
        POS = {
            NN: 'NN',           // singular noun
            NNS: 'NNS',         // plural noun
            NNP: 'NNP',         // proper noun
            JJ: 'JJ'            // adjective
        };

    //  CONSTRUCTOR
    function KeywordExtractor() {
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

        stemmer = natural.PorterStemmer; //natural.LancasterStemmer;
        stemmer.attach();
        tokenizer = new natural.WordTokenizer;
        nounInflector = new natural.NounInflector();
        nounInflector.attach();
        //tfidf = new natural.TfIdf(),
        stopWords = natural.stopwords;
        lexer = new pos.Lexer();
        tagger = new pos.Tagger();
    }


/************************************************************************************************************************************
*
*   PRIVATE METHODS
*
************************************************************************************************************************************/



    var extractDocumentKeywords = function(collection) {

        //POS tagging
        collection.forEach(function(d, i) {
            d.taggedWords = tagger.tag(lexer.lex(d.text));
        });

        // Find out which adjectives are potentially important and worth keeping
        var keyAdjectives = getKeyAdjectives(collection);

        // Create each item's document to be processed by tf*idf
        collection.forEach(function(d) {
            d.language = "en";
           	d.tokens = getFilteredTokens(d.taggedWords, keyAdjectives);                                       // d.tokens contains raw nouns and important adjectives
        	tfidf.addDocument(d.tokens.map(function(term){ return term.stem(); }).join(' '));                 // argument = string of stemmed terms in document array
        });

        // Save keywords for each document
        var documentKeywords = [];
        collection.forEach(function(d, i){
            documentKeywords.push(getDocumentKeywords(i));
        });

        return documentKeywords;
    };



    var getKeyAdjectives = function(_collection) {

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
    var getFilteredTokens = function(taggedWords, keyAdjectives) {
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


    var getDocumentKeywords = function(dIndex) {
        var docKeywords = {};

        tfidf.listTerms(dIndex).forEach(function(item){
            if(isNaN(item.term) && parseFloat(item.tfidf) > 0 )
                docKeywords[item.term] = item.tfidf;
        });
        return docKeywords;
    }




    /////////////////////////////////////////////////////////////////////////////

    var extractCollectionKeywords = function(collection, documentKeywords, minDocFrequency) {

        minDocFrequency = minDocFrequency ? minDocFrequency : s.minDocFrequency;
        var keywordDict = getKeywordDictionary(collection, documentKeywords, minDocFrequency);

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
        keywordDict = computeKeywordsInProximity(collection, keywordDict);
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
            keywordDict[keyword].term = getRepresentativeTerm(keywordDict[keyword]);

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



    var getKeywordDictionary = function(_collection, _documentKeywords, _minDocFrequency) {

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


    var computeKeywordsInProximity = function(_collection, _keywordDict) {
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


    var getRepresentativeTerm = function(k){

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
        var shortestTerm = keys[0];
        for(var i = 1; i < keys.length; i++){
            if(keys[i].length < shortestTerm.length)
                shortestTerm = keys[i];
        }
        return shortestTerm.toLowerCase();
    };



/********************************************************************************************************************************************
*
*   PROTOTYPE
*
*********************************************************************************************************************************************/

    KeywordExtractor.prototype = {
        addDocument: function(document, id, language) {
            document = (!Array.isArray(document)) ? document : document.join(' ');
            id = id || this.collection.length;
			language = language || "en";
            this.collection.push({ id: id, text: document, language: language });
        },
        processCollection: function() {
            tfidf = new natural.TfIdf();
            var timestamp = new Date().getTime();
            this.documentKeywords = extractDocumentKeywords(this.collection);
            var collectionKeywords = extractCollectionKeywords(this.collection, this.documentKeywords);
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
        clear: function() {
            tfidf = null;
            this.collection = [];
            this.documentKeywords = [];
            this.collectionKeywords = [];
            this.collectionKeywordsDict = {};
        }
    };

    return KeywordExtractor;
})();

String.prototype.removeUnnecessaryChars = function() {
    return this.replace(/[-=’‘\']/g, ' ').replace(/[()\"“”]/g,'');
};

String.prototype.isAllUpperCase = function() {
    return this.valueOf().toUpperCase() === this.valueOf();
};

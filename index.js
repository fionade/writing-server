const restify = require('restify');
const natural = require('natural');
const pos = require('pos');
const _ = require('underscore');
var KeywordExtractor = require('./keywordExtractor2');

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
  var keyword = request.params.keyword;
  var collection = request.params.collection;

  if (databaseConnector && databaseConnector.isConnected()) {
    databaseConnector.getKeywordSurroundings(keyword, collection, function(err, result) {
      if (result.length > 0) {
        result = {
          leftParts : result[0].leftParts.slice(0, Math.min(result[0].leftParts.length, 5)),
          rightParts : result[0].rightParts.slice(0, Math.min(result[0].rightParts.length, 5)),
          variations : result[0].variations.slice(0, Math.min(result[0].variations.length, 5))
        }
      }
      else {
        result = null;
      }
      response.send(200, result);
    });
  }

  next();
}

function getSynonyms(request, response, next) {
  var term = request.params.term;

  synonymHelper.getSynonyms(term, function(result) {
    response.send(200, result);
  });

  next();

}

function getTextMeasures(request, response, next) {

  var params = JSON.parse(request.body);
  var text = params.text;

  var TextMetrics = require("./textMetrics");
  var textMetrics = new TextMetrics();

  var fleschKincaidScore = Math.round(textMetrics.getFleschKincaid(text) * 100) / 100;
  var mostFrequentWords = textMetrics.getMostFrequentWords(text);
  mostFrequentWords = mostFrequentWords.slice(0, 5);
  var frequentConjunctions = textMetrics.getConjunctions(text);
  frequentConjunctions = frequentConjunctions.slice(0, 5);

  // POS tagging: return
  var result = {
    fleschKincaidScore : fleschKincaidScore,
    mostFrequentWords : mostFrequentWords,
    frequentConjunctions : frequentConjunctions
  }

  response.send(200, result);

  next();
}

function getMatchesForKeywords(request, response, next) {

  var keywords = JSON.parse(request.body);
  if (keywords.collection) {
    var result = collectionDocumentKeywordExtractor.getMatchesForKeywords(keywords.keywords);
    response.send(200, result);
  }
  else {
    var result = documentKeywordExtractor.getMatchesForKeywords(keywords.keywords);
    response.send(200, result);
  }

  next();

}

var server = restify.createServer();

server.use(restify.gzipResponse());
server.use(restify.bodyParser());
server.use(restify.queryParser());

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

server.post({
  path: '/getTextMeasures'
}, getTextMeasures);

server.post({
  path: '/getMatches'
}, getMatchesForKeywords);

server.get('/getContext/:keyword/:collection', retrieveContexts);

server.get('/getContext/:keyword', retrieveContexts);

server.get('/getSynonyms/:term', getSynonyms);

// set up database connection
var DatabaseConnector = require("./databaseConnector");
var databaseConnector = new DatabaseConnector();

var documentKeywordExtractor = new KeywordExtractor();
var collectionDocumentKeywordExtractor = new KeywordExtractor();

var TypingToolHelper = require("./typingToolHelper");
var typingToolHelper = new TypingToolHelper(databaseConnector, documentKeywordExtractor);
var collectionTypingToolHelper = new TypingToolHelper(databaseConnector, collectionDocumentKeywordExtractor, "context_KT");

var SynonymHelper = require("./synonymHelper");
var synonymHelper = new SynonymHelper(databaseConnector);

databaseConnector.connect(function() {
  // uncomment on first run
  databaseConnector.clearCollection("context");
  typingToolHelper.getFileNames("./text_files");
  collectionTypingToolHelper.getFileNames("./text_files_KT");
  //synonymHelper.initDatabase();
});

// TODO REST call for this
// let's hope it's already connected

// TODO
// databaseConnector.close();

// start listening
server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});



String.prototype.removeUnnecessaryChars = function() {
    return this.replace(/[-=’‘\']/g, ' ').replace(/[()\"“”]/g,'');
};

String.prototype.isAllUpperCase = function() {
    return this.valueOf().toUpperCase() === this.valueOf();
};

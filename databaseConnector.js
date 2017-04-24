var collectionName = "study";

function DatabaseConnector() {
	this.MongoClient = require('mongodb').MongoClient;
	this.assert = require('assert');
}

DatabaseConnector.prototype.connect = function connect(callback) {
	// Connection URL
	var url = 'mongodb://localhost:27017/breakfast';
	var that = this;

	// Use connect method to connect to the server
	this.MongoClient.connect(url, function(err, db) {
	  that.assert.equal(null, err);
	  console.log("Connected successfully to server");
	  that.db = db;
		callback();
	});
}

DatabaseConnector.prototype.close = function close() {
	if (this.db) {
		this.db.close();
	}
}

DatabaseConnector.prototype.insertDocument = function insertDocument(document) {

	var that = this;

	// Get the documents collection
	var collection = this.db.collection(collectionName);
	collection.insert(document, function(err, result) {
		that.assert.equal(err, null);
		that.assert.equal(1, result.result.n);
    that.assert.equal(1, result.ops.length);
    	//console.log("Inserted document into the collection");
	});
}

DatabaseConnector.prototype.insertDocumentIntoCollection = function insertDocumentIntoCollection(document, collection) {

	var that = this;

	// Get the documents collection
	var collection = this.db.collection(collection);
	collection.insert(document, function(err, result) {
		that.assert.equal(err, null);
		that.assert.equal(1, result.result.n);
    that.assert.equal(1, result.ops.length);
    //console.log("Inserted document into the collection");
	});
}

DatabaseConnector.prototype.insertDocuments = function insertDocuments(documents) {

	var that = this;

	// Get the documents collection
	var collection = this.db.collection(collectionName);
	collection.insert(document, function(err, result) {
		that.assert.equal(err, null);
    console.log("Inserted documents into the collection");
	});
}

DatabaseConnector.prototype.isConnected = function isConnected() {
	return this.db;
}

DatabaseConnector.prototype.getDocumentsForId = function getDocumentsForId(documentId, callback) {
	var collection = this.db.collection(collectionName);

	collection.find({"documentId" : documentId}).sort({"documentId" : 1}).toArray(function(err, docs){
    	callback(err, docs);
	});
}

DatabaseConnector.prototype.getKeywordSurroundings = function getKeywordSurroundings(keyword, callback) {

	var collection = this.db.collection('context');

	collection.find({ 'variations' : { $in : [keyword]}}).toArray(function(err, docs) {
		callback(err, docs);
	});

}

DatabaseConnector.prototype.clearCollection = function clearCollection(collection) {

	var collection = this.db.collection(collection);

	collection.remove({});
}

module.exports = DatabaseConnector;


// http://stackoverflow.com/questions/20534702/node-js-use-of-module-exports-as-a-constructor

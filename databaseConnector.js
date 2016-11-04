function DatabaseConnector() {
	this.MongoClient = require('mongodb').MongoClient;
	this.assert = require('assert');
}

DatabaseConnector.prototype.connect = function connect() {
	// Connection URL
	var url = 'mongodb://localhost:27017/breakfast';
	var that = this;

	// Use connect method to connect to the server
	this.MongoClient.connect(url, function(err, db) {
	  that.assert.equal(null, err);
	  console.log("Connected successfully to server");
	  that.db = db;
	});
}

DatabaseConnector.prototype.close = function close() {
	if (this.db) {
		this.db.close();
	}
}

DatabaseConnector.prototype.insertDocument = function insertDocuments(document) {

	var that = this;

	// Get the documents collection
	var collection = this.db.collection('activity');
	collection.insert(document, function(err, result) {
		that.assert.equal(err, null);
		that.assert.equal(1, result.result.n);
    	that.assert.equal(1, result.ops.length);
    	console.log("Inserted document into the collection");
	});
}

DatabaseConnector.prototype.isConnected = function isConnected() {
	return this.db;
}

module.exports = DatabaseConnector;


// http://stackoverflow.com/questions/20534702/node-js-use-of-module-exports-as-a-constructor
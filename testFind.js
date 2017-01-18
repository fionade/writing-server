// set up database connection
var DatabaseConnector = require("./databaseConnector");
var databaseConnector = new DatabaseConnector();

databaseConnector.connect();

function testRetrieval() {
	if (databaseConnector && databaseConnector.isConnected()) {
		databaseConnector.getDocumentsForId("1hMEW-iPT9jhS0StAIg8GVWv6nqht5QS6KMMynXYHqvI", function(err, result) {
			console.log(result);
		});
	}
}

setTimeout(testRetrieval, 3000);
const syllable = require('syllable');
const natural = require('natural');
const pos = require('pos');

function TextMetrics() {
  this.tokenizer = new natural.WordTokenizer();
  this.stopWords = natural.stopwords;
  this.POSTagger = new pos.Tagger();
  this.lexer = new pos.Lexer();
}

TextMetrics.prototype.getFleschKincaid = function getFleschKincaid(text) {

  var syllables = syllable(text);
  var sentences = text.match(/\(?[^\.\?\!]+[\.!\?]\)?/g).length;
  var words = this.tokenizer.tokenize(text).length;

  var fleschKincaidScore;
  if (!syllables || !sentences || !words) {
    fleschKincaidScore = NaN;
  }
  else {
    fleschKincaidScore = (0.39 * (words / sentences)) + (11.8 * (syllables / words)) - 15.59;
  }

  return fleschKincaidScore;
}

TextMetrics.prototype.getMostFrequentWords = function getMostFrequentWords(text) {

  var words = this.tokenizer.tokenize(text);
  var that = this;

  var repetitions = {};
  words.forEach(function(d) {
    var token = d.toLowerCase();
    if (that.stopWords.indexOf(token) == -1) {
      if (!repetitions[token]) {
        repetitions[token] = 1;
      }
      else {
        repetitions[token] += 1;
      }
    }
  });

  return repetitions;

}

TextMetrics.prototype.getConjunctions = function getConjunctions(text) {

  var taggedWords = this.POSTagger.tag(this.lexer.lex(text));

  var repetitions = {};
  taggedWords.forEach(function(d) {
    if (d[1] == "CC" || d[1] == "CC") {
      var token = d[0].toLowerCase();
      if (!repetitions[token]) {
        repetitions[token] = 1;
      }
      else {
        repetitions[token] += 1;
      }
    }
  });

  console.log(repetitions);

  var result = sortByRepetitions(repetitions);
  console.log(result);

  return result;

  // https://github.com/mark-watson/fasttag_v2

}

function sortByRepetitions(namedArray) {

  var list = [];
  Object.keys(namedArray).forEach(function(d) {
    if (namedArray.hasOwnProperty(d)) {
      list.push( {
        term : d,
        repetitions : namedArray[d]
      });
    }
  });

  return list.sort(function(k1, k2) {
    if (k1.repetitions < k2.repetitions) return 1;
    if (k1.repetitions > k2.repetitions) return -1;
    return 0;
  });
}

module.exports = TextMetrics;

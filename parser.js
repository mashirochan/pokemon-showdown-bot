
var sys = require('sys');
var https = require('https');
var url = require('url');

const ACTION_COOLDOWN = 3*1000;
const FLOOD_MESSAGE_NUM = 5;
const FLOOD_PER_MSG_MIN = 500;
const FLOOD_MESSAGE_TIME = 6*1000;
const MIN_CAPS_LENGTH = 12;
const MIN_CAPS_PROPORTION = 0.8;

settings = {};
try {
	settings = JSON.parse(fs.readFileSync('settings.json'));
	if (!Object.keys(settings).length && settings !== {}) settings = {};
} catch (e) {} // file doesn't exist [yet]

userlog = {};
try {
	userlog = JSON.parse(fs.readFileSync('userlog.json'));
	if (!Object.keys(userlog).length && userlog !== {}) userlog = {};
} catch (e) {} // file doesn't exist [yet]

bannedWords = {};
try {
	bannedWords = JSON.parse(fs.readFileSync('bannedWords.json'));
	if (!Object.keys(bannedWords).length && bannedWords !== {}) bannedWords = {};
} catch (e) {} // file doesn't exist [yet]

bannedSites = {};
try {
	bannedSites = JSON.parse(fs.readFileSync('bannedSites.json'));
	if (!Object.keys(bannedSites).length && bannedSites !== {}) bannedSites = {};
} catch (e) {} // file doesn't exist [yet]

exports.parse = {
	actionUrl: url.parse('https://play.pokemonshowdown.com/~~' + config.serverid + '/action.php'),
	room: 'lobby',
	'settings': settings,
	'userlog': userlog,
	'bannedWords': bannedWords,
	'bannedSites': bannedSites,
	chatData: {},
	ranks: {},
	msgQueue: [],

	data: function(data, connection) {
		if (data.substr(0, 1) === 'a') {
			data = JSON.parse(data.substr(1));
			if (data instanceof Array) {
				for (var i = 0, len = data.length; i < len; i++) {
					this.splitMessage(data[i], connection);
				}
			} else {
				this.splitMessage(data, connection);
			}
		}
	},
	splitMessage: function(message, connection) {
		if (!message) return;

		var room = 'lobby';
		if (message.indexOf('\n') < 0) return this.message(message, connection, room); // <- this.
		
		var spl = message.split('\n');
		
			if (spl[2]) {
			if (spl[2].substr(1, 10) === 'tournament') {
				var splTour = spl[2].split('|');
			}
			}
		
		if (spl[0].charAt(0) === '>') {
			if (spl[1].substr(1, 4) === 'init') return ok('joined ' + spl[2].substr(7));
			if (spl[1].substr(1, 10) === 'tournament') return;
			room = spl.shift().substr(1);
		}

		for (var i = 0, len = spl.length; i < len; i++) {
			this.message(spl[i], connection, room);
		}
	},
	message: function(message, connection, room) {
		var spl = message.split('|');
		if (!spl[1]) {
			spl = spl[0].split('>');
			if (spl[1]) this.room = spl[1];
			return;
		}
		
		switch (spl[1]) {
			case 'challstr':
				info('received challstr, logging in...');
				var id = spl[2];
				var str = spl[3];

				var requestOptions = {
					hostname: this.actionUrl.hostname,
					port: this.actionUrl.port,
					path: this.actionUrl.pathname,
					agent: false
				};

				if (!config.pass) {
					requestOptions.method = 'GET';
					requestOptions.path += '?act=getassertion&userid=' + toId(config.nick) + '&challengekeyid=' + id + '&challenge=' + str;
				} else {
					requestOptions.method = 'POST';
					var data = 'act=login&name=' + config.nick + '&pass=' + config.pass + '&challengekeyid=' + id + '&challenge=' + str;
					requestOptions.headers = {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': data.length
					};
				}

				var req = https.request(requestOptions, function(res) {
					res.setEncoding('utf8');
					var data = '';
					res.on('data', function(chunk) {
						data += chunk;
					});
					res.on('end', function() {
						if (data === ';') {
							error('failed to log in; nick is registered - invalid or no password given');
							process.exit(-1);
						}
						if (data.length < 50) {
							error('failed to log in: ' + data);
							process.exit(-1);
						}

						if (data.indexOf('heavy load') !== -1) {
							error('the login server is under heavy load; trying again in one minute');
							setTimeout(function() {
								this.message(message);
							}.bind(this), 60 * 1000);
							return;
						}

						if (data.substr(0, 16) === '<!DOCTYPE html>') {
							error('Connection error 522; trying agian in one minute');
							setTimeout(function() {
								this.message(message);
							}.bind(this), 60 * 1000);
							return;
						}

						try {
							data = JSON.parse(data.substr(1));
							if (data.actionsuccess) {
								data = data.assertion;
							} else {
								error('could not log in; action was not successful: ' + JSON.stringify(data));
								process.exit(-1);
							}
						} catch (e) {}
						send(connection, '|/trn ' + config.nick + ',0,' + data);
					}.bind(this));
				}.bind(this));

				req.on('error', function(err) {
					error('login error: ' + sys.inspect(err));
				});

				if (data) req.write(data);
				req.end();
				break;
			case 'updateuser':
				if (spl[2] !== config.nick) return;

				if (spl[3] !== '1') {
					error('failed to log in, still guest');
					process.exit(-1);
				}

				ok('logged in as ' + spl[2] + '^-^');

				this.msgQueue.push('|/blockchallenges');
				for (var i = 0, len = config.rooms.length; i < len; i++) {
					var room = config.rooms[i];
					if (room === 'lobby' && config.serverid === 'showdown') continue;
					this.msgQueue.push('|/join ' + room);
					this.msgQueue.push('|/avatar ' + config.avatarNumber);
				}
				for (var i = 0, len = config.privaterooms.length; i < len; i++) {
					var room = config.privaterooms[i];
					if (room === 'lobby' && config.serverid === 'showdown') continue;
					this.msgQueue.push('|/join ' + room);
					this.msgQueue.push('|/avatar ' + config.avatarNumber);
				}
				this.msgDequeue = setInterval(function () {
					var msg = this.msgQueue.shift();
					if (msg) return send(connection, msg);
					clearInterval(this.msgDequeue);
					this.msgDequeue = null;
				}.bind(this), 750);
				setInterval(this.cleanChatData.bind(this), 30 * 60 * 1000);
				break;
			case 'c':
				var by = spl[2];
				spl = spl.splice(3).join('|');
				this.processChatData(toId(by), room, connection, spl);
				this.chatMessage(spl, by, room, connection);
				if (toId(by) === toId(config.nick) && ' +%@#~'.indexOf(by.charAt(0)) > -1) this.ranks[room] = by.charAt(0);
				break;
			case 'c:':
				var by = spl[3];
				spl = spl.splice(4).join('|');
				this.processChatData(toId(by), room, connection, spl);
				this.chatMessage(spl, by, room, connection);
				if (toId(by) === toId(config.nick) && ' +%@#~'.indexOf(by.charAt(0)) > -1) this.ranks[room] = by.charAt(0);
				break;
			case 'pm':
				var by = spl[2];
				spl = spl.splice(4).join('|');
				if (toId(by) === toId(config.nick) && ' +%@#~'.indexOf(by.charAt(0)) > -1) this.ranks[room] = by.charAt(0);
				this.chatMessage(spl, by, ',' + by, connection);
				break;
			case 'N':
				var by = spl[2];
				this.updateSeen(spl[3], spl[1], toId(by));
				if (toId(by) !== toId(config.nick) || ' +%@&#~'.indexOf(by.charAt(0)) === -1) return;
				this.ranks[toId(this.room === '' ? 'lobby' : this.room)] = by.charAt(0);
				this.room = '';
				break;
			case 'J': case 'j':
				var by = spl[2];
				this.updateSeen(by, spl[1], (this.room === '' ? 'lobby' : this.room));
				if (toId(by) === toId(config.nick) && ' +%@&#~'.indexOf(by.charAt(0)) > -1) this.ranks[room] = by.charAt(0);
				break;
			case 'l': case 'L':
				var by = spl[2];
				this.updateSeen(by, spl[1], (this.room === '' ? 'lobby' : this.room));
				this.room = '';
				break;
			case 'raw':
				break;
		}
	},
	chatMessage: function(message, by, room, connection) {
		var now = Date.now();
		var cmdrMessage = '["' + room + '|' + by + '|' + message + '"]';
		message = message.trim();
		// auto accept invitations to rooms
		if (room.charAt(0) === ',' && message.substr(0,8) === '/invite ' && this.hasRank(by, '%@&~') && !(config.serverid === 'showdown' && toId(message.substr(8)) === 'lobby')) {
			this.say(connection, '', '/join ' + message.substr(8));
		}
		if (message.substr(0, config.commandcharacter.length) !== config.commandcharacter || toId(by) === toId(config.nick)) return;

		message = message.substr(config.commandcharacter.length);
		var index = message.indexOf(' ');
		var arg = '';
		if (index > -1) {
			var cmd = message.substr(0, index);
			arg = message.substr(index + 1).trim();
		} else {
			var cmd = message;
		}

		if (Commands[cmd]) {
			var failsafe = 0;
			while (typeof Commands[cmd] !== "function" && failsafe++ < 10) {
				cmd = Commands[cmd];
			}
			if (typeof Commands[cmd] === "function") {
				cmdr(cmdrMessage);
				Commands[cmd].call(this, arg, by, room, connection);
			} else {
				error("invalid command type for " + cmd + ": " + (typeof Commands[cmd]));
			}
		}

	},
	say: function(connection, room, text) {
		if (room.charAt(0) !== ',') {
			var str = (room !== 'lobby' ? room : '') + '|' + text;
			send(connection, str);
		} else {
			room = room.substr(1);
			var str = '|/pm ' + room + ', ' + text;
			send(connection, str);
		}
	},
	hasRank: function(user, rank) {
		var hasRank = (rank.split('').indexOf(user.charAt(0)) !== -1) || (config.excepts.indexOf(toId(user)) !== -1);
		return hasRank;
	},
	canUse: function(cmd, room, user) {
		var canUse = false;
		var ranks = ' +%@&#~';
		if (!this.settings[cmd] || !this.settings[cmd][room]) {
			canUse = this.hasRank(user, ranks.substr(ranks.indexOf((cmd === 'autoban' || cmd === 'banword') ? '#' : config.defaultrank)));
		} else if (this.settings[cmd][room] === true) {
			canUse = true;
		} else if (ranks.indexOf(this.settings[cmd][room]) > -1) {
			canUse = this.hasRank(user, ranks.substr(ranks.indexOf(this.settings[cmd][room])));
		}
		return canUse;
	},
	uploadToHastebin: function(con, room, by, toUpload) {
		var self = this;

		var reqOpts = {
			hostname: "hastebin.com",
			method: "POST",
			path: '/documents'
		};

		var req = require('http').request(reqOpts, function(res) {
			res.on('data', function(chunk) {
				self.say(con, room, (room.charAt(0) === ',' ? "" : "/pm " + by + ", ") + "hastebin.com/raw/" + JSON.parse(chunk.toString())['key']);
			});
		});
		req.write(toUpload);
		req.end();
	},
	processChatData: function(user, room, connection, msg, by) {
		var botName = msg.toLowerCase().indexOf(toId(config.nick));
		
		if (toId(user.substr(1)) === toId(config.nick)) {
			this.ranks[room] = user.charAt(0);
			return;
		}
	
		var by = user;
		user = toId(user);
		
		if (!user || room.charAt(0) === ',') return;
		room = toId(room);
		msg = msg.trim().replace(/[ \u0000\u200B-\u200F]+/g, ' '); // removes extra spaces and null characters so messages that should trigger stretching do so
		
		this.updateSeen(user, 'c', room);
		var now = Date.now();
		if (!this.chatData[user]) this.chatData[user] = {zeroTol: 0, lastSeen: '', seenAt: now};
		
		var userData = this.chatData[user];
		if (!this.chatData[user][room]) this.chatData[user][room] = {times: [],	points: 0, lastAction: 0};
		
		var roomData = userData[room];
		roomData.times.push(now);
		this.chatData[user][room].times.push(now);
		
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////// Regex /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Moderation ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////        		
		
		if (!this.userlog) this.userlog = {};
		if (!this.userlog[user]) this.userlog[user] = {};
		var offense = false;
		var rule = '';
		var rule2 = '';
		
		// Banned Phrases Moderation
		for (var i in this.bannedWords["words"]) {
			var word = "\\b(" + this.bannedWords["words"][i] + ")\\b";
			var reg = new RegExp(word, "g");
			if (reg.test(msg) && config.whitelist.indexOf(user) === -1) {
			offense = true;
			rule = 'say that';
			rule2 = 'Banned Phrase';
			}
		}
		
		// Caps Moderation
		var capsMatch = msg.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
		if (capsMatch && toId(msg).length > MIN_CAPS_LENGTH && (capsMatch.length >= Math.floor(toId(msg).length * MIN_CAPS_PROPORTION)) && config.whitelist.indexOf(user) === -1) {
			offense = true;
			rule = 'use so much caps';
			rule2 = 'Caps';
		}
		
		// Stretching Moderation
		var stretchMatch = msg.toLowerCase().match(/(.)\1{7,}/g) || msg.toLowerCase().match(/(..+)\1{4,}/g);
		if (stretchMatch && config.whitelist.indexOf(user) === -1) {
			offense = true;
			rule = 'stretch';
			rule2 = 'Stretching';
		}
		
		// Flooding Moderation
		var d = new Date();
		if (!this.userlog[user]["firstMessage"]) {
			this.userlog[user]["firstMessage"] = d.getTime();
			this.userlog[user]["messageCount"] = 1;
		}
		if (d.getTime() - this.userlog[user]["firstMessage"]  < (6 * 1000)) {
			this.userlog[user]["messageCount"]++;
			if (this.userlog[user]["messageCount"] >= 6) {
				offense = true;
				rule = 'flood the chat';
				rule2 = 'Flooding';
				if (!this.userlog[user]["points"]) this.userlog[user]["points"] = 0;
				this.userlog[user]["points"]++;
			}
		} else {
			delete this.userlog[user]["firstMessage"];
			delete this.userlog[user]["messageCount"];
		}
		
		// Bot Commands Moderation
		var d = new Date();
		if (msg.charAt(0) == '#') {
			if (!this.userlog[user]["firstCommand"]) {
				this.userlog[user]["firstCommand"] = d.getTime();
				this.userlog[user]["commandCount"] = 1;
			}
			if (d.getTime() - this.userlog[user]["firstCommand"]  < (180000)) {
				this.userlog[user]["commandCount"]++;
				if (this.userlog[user]["commandCount"] >= 6) {
					offense = true;
					rule = 'use so many commands';
					rule2 = 'Spamming Commands';
					if (!this.userlog[user]["points"]) this.userlog[user]["points"] = 0;
					delete this.userlog[user]["firstCommand"];
					delete this.userlog[user]["commandCount"];
					this.userlog[user]["points"]++;
				}
			} else {
				delete this.userlog[user]["firstCommand"];
				delete this.userlog[user]["commandCount"];
			}
		}
		
		// Points / Cooldown
		if (offense == true) {
			if (!this.userlog) this.userlog = {};
				if (!this.userlog[user]) this.userlog[user] = {};
				if (!this.userlog[user]["points"]) this.userlog[user]["points"] = 0;
				d = new Date();
				if (this.userlog[user]["lastOffense"] && (d.getTime() - this.userlog[user]["lastOffense"] > (2 * 86400000))) { // After two days, a user will start to lose points
					this.userlog[user]["points"] -= Math.floor(((d.getTime() - this.userlog[user]["lastOffense"]) / (2 * 86400000))); // Users lose one point every two days
					if (this.userlog[user]["points"] < 0) this.userlog[user]["points"] = 0;
				}
				this.userlog[user]["points"]++;
				this.userlog[user]["lastOffense"] = d.getTime();
				if (this.userlog[user]["points"] == 1 || this.userlog[user]["points"] == 2) {
					this.say(connection, room, '/k ' + user + ', Please do not ' + rule + '!');
					if (!this.userlog[user]["warns"]) this.userlog[user]["warns"] = 1;
					else this.userlog[user]["warns"]++;
				} else if (this.userlog[user]["points"] == 3) {
					this.say(connection, room, '/m ' + user + ', You\'ve been warned twice already.. ;~; (' + rule2 + ')');
					if (!this.userlog[user]["mutes"]) this.userlog[user]["mutes"] = 1;
					else this.userlog[user]["mutes"]++;
				} else if (this.userlog[user]["points"] == 4) {
					this.say(connection, room, '/hm ' + user + ', How any times do I have to tell you ;-; (' + rule2 + ')');
					if (!this.userlog[user]["mutes"]) this.userlog[user]["mutes"] = 1;
					else this.userlog[user]["mutes"]++;
				} else if (this.userlog[user]["points"] == 5) {
					this.say(connection, room, '/rb ' + user + ', rip ;-; (' + rule2 + ')');
					if (!this.userlog[user]["bans"]) this.userlog[user]["bans"] = 1;
					else this.userlog[user]["bans"]++;
					this.userlog[user]["points"] = 0;
				}
				this.writeUserlog();
		}
	},
	cleanChatData: function() {
		
		var chatData = this.chatData;
		for (var user in chatData) {
			for (var room in chatData[user]) {
				var roomData = chatData[user][room];
				if (!Object.isObject(roomData)) continue;

				if (!roomData.times || !roomData.times.length) {
					delete chatData[user][room];
					continue;
				}
				var newTimes = [];
				var now = Date.now();
				var times = roomData.times;
				for (var i = 0, len = times.length; i < len; i++) {
					if (now - times[i] < 5 * 1000) newTimes.push(times[i]);
				}
				newTimes.sort(function (a, b) {
					return a - b;
				});
				roomData.times = newTimes;
				if (roomData.points > 0 && roomData.points < 4) roomData.points--;
			}
		}
	},
	updateSeen: function(user, type, detail) {
		if (type !== 'n' && config.rooms.indexOf(detail) === -1 || config.privaterooms.indexOf(toId(detail)) > -1) return;
		var now = Date.now();
		if (!this.chatData[user]) this.chatData[user] = {
			zeroTol: 0,
			lastSeen: '',
			seenAt: now
		};
		if (!detail) return;
		var userData = this.chatData[user];
		var msg = '';
		switch (type) {
		case 'j':
		case 'J':
			msg += 'joining ';
			break;
		case 'l':
		case 'L':
			msg += 'leaving ';
			break;
		case 'c':
		case 'c:':
			msg += 'chatting in ';
			break;
		case 'N':
			msg += 'changing nick to ';
			if (detail.charAt(0) !== ' ') detail = detail.substr(1);
			break;
		}
		msg += detail.trim() + '.';
		userData.lastSeen = msg;
		userData.seenAt = now;
	},
	getTimeAgo: function(time) {
		time = ~~((Date.now() - time) / 1000);

		var seconds = time % 60;
		var times = [];
		if (seconds) times.push(seconds + (seconds === 1 ? ' second': ' seconds'));
		if (time >= 60) {
			time = ~~((time - seconds) / 60);
			var minutes = time % 60;
			if (minutes) times.unshift(minutes + (minutes === 1 ? ' minute' : ' minutes'));
			if (time >= 60) {
				time = ~~((time - minutes) / 60);
				hours = time % 24;
				if (hours) times.unshift(hours + (hours === 1 ? ' hour' : ' hours'));
				if (time >= 24) {
					days = ~~((time - hours) / 24);
					if (days) times.unshift(days + (days === 1 ? ' day' : ' days'));
				}
			}
		}
		if (!times.length) return '0 seconds';
		return times.join(', ');
	},
	writeSettings: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeSettings();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.settings);
			fs.writeFile('settings.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('settings.json.0', 'settings.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('settings.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeUserlog: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeUserlog();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.userlog);
			fs.writeFile('userlog.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('userlog.json.0', 'userlog.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('userlog.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeBannedSites: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeBannedSites();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;

			}
			writing = true;
			var data = JSON.stringify(this.bannedSites);
			fs.writeFile('bannedSites.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('bannedSites.json.0', 'bannedSites.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('bannedSites.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeBannedWords: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeBannedWords();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;

			}
			writing = true;
			var data = JSON.stringify(this.bannedWords);
			fs.writeFile('bannedWords.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('bannedWords.json.0', 'bannedWords.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('bannedWords.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	uncacheTree: function(root) {
		var uncache = [require.resolve(root)];
		do {
			var newuncache = [];
			for (var i = 0; i < uncache.length; ++i) {
				if (require.cache[uncache[i]]) {
					newuncache.push.apply(newuncache,
						require.cache[uncache[i]].children.map(function(module) {
							return module.filename;
						})
					);
					delete require.cache[uncache[i]];
				}
			}
			uncache = newuncache;
		} while (uncache.length > 0);
	},
	getDocMeta: function(id, callback) {
		https.get('https://www.googleapis.com/drive/v2/files/' + id + '?key=' + config.googleapikey, function (res) {
			var data = '';
			res.on('data', function (part) {
				data += part;
			});
			res.on('end', function (end) {
				var json = JSON.parse(data);
				if (json) {
					callback(null, json);
				} else {
					callback('Invalid response', data);
				}
			});
		});
	},
	getDocCsv: function(meta, callback) {
		https.get('https://docs.google.com/spreadsheet/pub?key=' + meta.id + '&output=csv', function (res) {
			var data = '';
			res.on('data', function (part) {
				data += part;
			});
			res.on('end', function (end) {
				callback(data);
			});
		});
	}
};

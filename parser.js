
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

exports.parse = {
	actionUrl: url.parse('https://play.pokemonshowdown.com/~~' + config.serverid + '/action.php'),
	room: 'lobby',
	'settings': settings,
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
			//if (spl[2].substr(1, 5) === 'popup') this.say(connection, 'tha', '__authlist detected!__');
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
					var room = toId(config.rooms[i]);
					if (room === 'lobby' && config.serverid === 'showdown') continue;
					this.msgQueue.push('|/join ' + room);
					this.msgQueue.push('|/avatar ' + config.avatarNumber);
				}
				for (var i = 0, len = config.privaterooms.length; i < len; i++) {
					var room = toId(config.privaterooms[i]);
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
		
		//Greetings & Farewells
//		if (/(good)? ?(night|nite) (everyone|guys|friends|all)/i.test(msg) && toId(config.nick) !== toId(by)) this.say(connection, room, 'Goodnight ' + by + '^-^');
//		else if (/i(\'?m| am).*go.*to (bed|sleep)/i.test(msg) && toId(config.nick) !== toId(by)) this.say(connection, room, 'Goodnight ' + by + '^-^');
//		else if (/(\bhey\b|hi|hello|ha+?i+) (everyone|guys|friends|all)/i.test(msg) && toId(config.nick) !== toId(by)) this.say(connection, room, 'Haaii ' + by + '^-^');
//		else if (/(bye|g2g|ba+?i+) (everyone|guys|friends|all)/i.test(msg) && toId(config.nick) !== toId(by)) this.say(connection, room, 'Baaii ' + by + '~');
//		else if (/g2g/i.test(msg) && toId(config.nick) !== toId(by)) this.say(connection, room, 'Baaii ' + by + '~');
		if (/how(\'re)? (r|are|is) (u|you|chu)? mash(i|y|iro)?bot??/i.test(msg)) this.say(connection, room, 'I am good, how are you ' + by + '? :o');
		else if (/(hi|hey|ha+?i+|hello) mash(i|y|iro)?bot/i.test(msg)) this.say(connection, room, 'Haaii ' + by + '!^-^');
		
		//Miscellaneous
		else if (/(why are there )?so many bots( in here)?\??/i.test(msg)) this.say(connection, room, 'Sorry if I\'m intruding, I\'ll try and be as quiet as possible! >~<');
		else if (/(mashiro|mashy|goddess ?mashiro)/i.test(msg) && isAfk == true) this.say(connection, room, '/w ' + by + ', Mashiro-chan is AFK right now, leave a PM or check back in a bit, thanks^-^');
		else if (/(why are there )?so many goddess(es)?( in here)?\??/i.test(msg)) this.say(connection, room, 'Mashiro is just a Briyella wannabe o3o');
//		if (/(9[0-9]|100)% compatible/i.test(msg)) {
//			var rand = ~~(2 * Math.random()) + 1;
//			if (rand == 1) this.say(connection, room, '__it was meant to be :O__');
//			if (rand == 2) this.say(connection, room, '/me plays wedding music');
//		}
		else if (/69% compatible/i.test(msg)) this.say(connection, room, '__l-lewd..!! ;~;__');
		else if (/(1| )[0-9]% compatible/i.test(msg)) this.say(connection, room, '__rip ;-;__');
//		else if (/I(\'?m| am) back/i.test(msg)) this.say(connection, room, 'Hi back, I am MashiBot o3o');
//		else if (/I(\'?m| am) tired/i.test(msg)) this.say(connection, room, 'Hi tired, I am MashiBot o3o');
//		else if (/I(\'?m| am) hungry/i.test(msg)) this.say(connection, room, 'Hi hungry, I am MashiBot o3o');
		else if (/(cut|kick|punch(es)?|hit|hurt|slap|stab)s? (goddess)? ?mash(y|iro)/i.test(msg)) this.say(connection, room, 'D-don\'t hurt my creator..!! >~<');

//		if (/(rekt|burn)/i.test(msg)) this.say(connection, room, '!data Rawst Berry');
		
		//Favorite Pokemon
		else if (/what(\'s| is)? (goddess ?)?mash(i|y|iro)?(chan|bot)?\'?s? fav(e|ou?rite)? poke(mon)?\??/i.test(msg)) this.say(connection, room, '!data Ninetales');
		
		//League Names
		if (/(does)? ?(some|any)(one|1|body) (here)? ?play (league( of legends)?|lol)/i.test(msg)) this.say(connection, room, 'Add Mashiro-chan on League if you want to play: LeInfiniti');
		
		//osu! room
		if (/(pronounce|say) osu/i.test(msg)) {
		if (room !== 'osu') return false;
		this.say(connection, room, 'osu! is pronounced like \"os\", not \"osu\". This is because when a \'u\' follows an \'s\' in Japanese, the \'u\' is silent.');
		}
		if (/what(\'s| is)? osu/i.test(msg)) {
		if (room !== 'osu') return false;
		this.say(connection, room, 'osu! is a Japanese rhythm game where the player hits notes in time with the beat of the music. There are 5 different game modes, the most popular being standard osu! and osu! mania.');
		}
		
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////// Reminder Regex ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////		
		
		if (/mashi(bot)?,? (please)? ?tell/i.test(msg)) {
			var user = msg.substr(msg.indexOf("tell") + 5, msg.indexOf("that") - 6 - msg.indexOf("tell"));
			var message = msg.substr(msg.indexOf("that") + 5, msg.length);
			var msgNew = toProperEnglish(message);
			if (!this.reminders) this.reminders = {};
			if (!this.reminders[toId(user)]) this.reminders[toId(user)] = {};
			this.reminders[toId(user)] = by + ' says \"' + msgNew + '\"';
			this.writeReminders();
			this.say(connection, room, '/w ' + toId(by) + ', __Message has been sent successfully to ' + user + '!^-^__');
		}
		if (/mashi(bot)?,? (please)? ?remind/i.test(msg)) {
			var user = msg.substr(msg.indexOf("remind") + 7, msg.indexOf("to") - 8 - msg.indexOf("remind"));
			var message = msg.substr(msg.indexOf("to") + 3, msg.length);
			var msgNew = toProperEnglish(message);
			if (!this.reminders) this.reminders = {};
			if (!this.reminders[toId(user)]) this.reminders[toId(user)] = {};
			this.reminders[toId(user)] = by + ' reminds you to \"' + msgNew + '\"';
			this.writeReminders();
			this.say(connection, room, '/w ' + toId(by) + ', __Reminder has been sent successfully to ' + user + '!^-^__');
		}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////// YouTube Links /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		
		if (/youtube\.com/i.test(msg)) {
			var id = msg.substring(msg.indexOf("=") + 1);
			var self = this;
			var options = {
  				host: 'www.googleapis.com',
  				path: '/youtube/v3/videos?id=' + id + '&key=AIzaSyBHyOyjHSrOW5wiS5A55Ekx4df_qBp6hkQ&fields=items(snippet(channelId,title,categoryId))&part=snippet'
			};
			var callback = function(response) {
  			var str = '';
  			response.on('data', function (chunk) {
    			str += chunk;
  			});
  			response.on('end', function () {
    			self.say(connection, room, '__"' + str.substring(str.indexOf("title") + 9, str.indexOf("categoryId") - 8) + '"__');
  			});
			};
			https.request(options, callback).end();
		}
		
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////// /me Regex /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		
		if (botName > -1 && toId(by) !== toId(config.nick)) {
			if (/^\/me/i.test(msg)) {
				if (/(pet|stroke)s?/i.test(msg)) {
					this.say(connection, room, '/me purrs~'); 
					return;
				}
				if (/licks?/i.test(msg)) {
					this.say(connection, room, '/me squirms ;~;'); 
					return;
				}
				if (/(kiss(es)?|kissu)/i.test(msg)) {
					this.say(connection, room, '/me blushes deeply'); 
					this.say(connection, room, 'o////o');
					return;
				}
				if (/(eat|nom|nibble)s?/i.test(msg)) {
					this.say(connection, room, 'nuuu dun eat me ;~;'); 
					this.say(connection, room, '/me hides'); 
					return;
				}
				if (/(hit|stab|punch|kick|hurt)s?/i.test(msg)) {
					this.say(connection, room, '/me cries in pain ;-;'); 
					return;
				}
				if (/(hug|glomp|squeeze)s?/i.test(msg)) {
					this.say(connection, room, '/me squee~ :3'); 
					return;
				}
				if (/(cuddle|snuggle)s?/i.test(msg)) {
					this.say(connection, room, '/me cuddles ' + by + ' back warmly<3'); 
					return;
				}
				if (/pokes?/i.test(msg)) {
					this.say(connection, room, 'oww!! >~<');
					return;
				}
				if (/(gives? food|a cookie)/i.test(msg)) {
					this.say(connection, room, '/me noms :3'); 
					return;
				}
				if (/(tickle)s?/i.test(msg)) {
					this.say(connection, room, '/me giggles and squirms');
					this.say(connection, room, 'Staaahhhpp!! ;~;');
					return;
				}
				if (/cr(y|i|ie)s? (in(to)?|on|against) mash(i|y|iro)?bot\'?s?/i.test(msg)) {
					this.say(connection, room, 'Don\'t worry, it will be okay^~^');
					this.say(connection, room, '/me hugs ' + by + ' gently');
				}
			}
		}
		
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Trivia ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////        		
		
		if (triviaActive == true) {
			var self = this;
			if (toId(msg) == toId(Trivia[questionCounter].answer)) {
				this.say(connection, room, '**' + by + '** has gotten the answer correct!');
				questionCounter = Math.round(Math.random() * Object.keys(Trivia).length);
				if (!participants[toId(by)]) participants[toId(by)] = 1;
				else participants[toId(by)]++;
				if (participants[toId(by)] == 3) {
					var winner = by;
					setTimeout(function(){self.say(connection, room, 'Congratulations **' + winner + '** on winning this trivia session!^-^');}, 2000);
					triviaActive = false;
					participants.length = 0;
					if (!this.scores[toId(by)]) this.scores[toId(by)] = 1;
					else this.scores[toId(by)] += 1;
					this.writeScores();
				} else setTimeout(function(){self.say(connection, room, '**Next Question:** ' + Trivia[questionCounter].question);}, 5000);
			}
		}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Moderation ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////        		
		
		if (/8=+D/i.test(msg)) this.say(connection, room, '/m ' + toId(by) + ', l-lewd..!! ;///;');
		if (config.allowmute && this.hasRank(this.ranks[room] || ' ', '%@&#~') && config.whitelist.indexOf(user) === -1) {
			var useDefault = !(this.settings['modding'] && this.settings['modding'][room]);
			var pointVal = 0;
			var warnMessage = '';
			// moderation for banned words
			if (useDefault || this.settings['modding'][room]['bannedwords'] !== 0 && pointVal < 2) {
				var bannedPhrases = !!this.settings.bannedphrases ? (Object.keys(this.settings.bannedphrases[room] || {})).concat(Object.keys(this.settings.bannedphrases['global'] || {})) : [];
				for (var i = 0; i < bannedPhrases.length; i++) {
					if (msg.toLowerCase().indexOf(bannedPhrases[i]) > -1) {
						pointVal = 2;
						this.say(connection, room, '/mute ' + user + ', please don\'t say that! ;w;');
						break;
					}
				}
			}
			// moderation for flooding (more than x lines in y seconds)
/*			var isFlooding = (this.chatData[user][room].times.length >= FLOOD_MESSAGE_NUM && (now - this.chatData[user][room].times[this.chatData[user][room].times.length - FLOOD_MESSAGE_NUM]) < FLOOD_MESSAGE_TIME
				&& (now - this.chatData[user][room].times[this.chatData[user][room].times.length - FLOOD_MESSAGE_NUM]) > (FLOOD_PER_MSG_MIN * FLOOD_MESSAGE_NUM));
			if ((useDefault || this.settings['modding'][room]['flooding'] !== 0) && isFlooding) {
				if (user === config.nick) {
					return;
				} else {
					this.say(connection, room, '__' + user + ', please don\'t flood the chat ;~;__');
				}
			} */
			// moderation for caps (over x% of the letters in a line of y characters are capital)
//			var capsMatch = msg.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
//			if ((useDefault || this.settings['modding'][room]['caps'] !== 0) && capsMatch && toId(msg).length > MIN_CAPS_LENGTH && (capsMatch.length >= Math.floor(toId(msg).length * MIN_CAPS_PROPORTION))) {
//				this.say(connection, room, '__' + user + ', p-please stop yelling..!! >~<__');
//			}
//			// moderation for stretching (over x consecutive characters in the message are the same)
//			var stretchMatch = msg.toLowerCase().match(/(.)\1{7,}/g) || msg.toLowerCase().match(/(..+)\1{4,}/g); // matches the same character (or group of characters) 8 (or 5) or more times in a row
//			if ((useDefault || this.settings['modding'][room]['stretching'] !== 0) && stretchMatch) {
//				this.say(connection, room, '__' + by + ', this isn\'t yoga, no stretching please ._.__');
//			}

		/*	if (pointVal > 0 && !(now - this.chatData[user][room].lastAction < ACTION_COOLDOWN)) {
				var cmd = '__';
				// defaults to the next punishment in config.punishVals instead of repeating the same action (so a second warn-worthy
				// offence would result in a mute instead of a warn, and the third an hourmute, etc)
				if (this.chatData[user][room].points >= pointVal && pointVal < 4) {
					this.chatData[user][room].points++;
					cmd = config.punishvals[this.chatData[user][room].points] || cmd;
				} else { // if the action hasn't been done before (is worth more points) it will be the one picked
					cmd = config.punishvals[pointVal] || cmd;
					this.chatData[user][room].points = pointVal; // next action will be one level higher than this one (in most cases)
				}
				if (config.privaterooms.indexOf(room) >= 0 && cmd === 'warn') cmd = '__'; // can't warn in private rooms
				// if the bot has % and not @, it will default to hourmuting as its highest level of punishment instead of roombanning
				if (this.chatData[user][room].points >= 4 && !this.hasRank(this.ranks[room] || ' ', '@&#~')) cmd = 'hourmute';
				if (this.chatData[user].zeroTol > 4) { // if zero tolerance users break a rule they get an instant roomban or hourmute
					warnMessage = ', Automated response: zero tolerance user';
					cmd = this.hasRank(this.ranks[room] || ' ', '@&#~') ? 'roomban' : 'hourmute';
				}
				if (this.chatData[user][room].points >= 2) this.chatData[user].zeroTol++; // getting muted or higher increases your zero tolerance level (warns do not)
				this.chatData[user][room].lastAction = now;
				this.say(connection, room, cmd + user + warnMessage);
			}
		*/}
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
	writeFriends: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeFriends();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.friends);
			fs.writeFile('friends.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('friends.json.0', 'friends.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('friends.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeNotes: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeNotes();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.notes);
			fs.writeFile('notes.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('notes.json.0', 'notes.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('notes.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeScores: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeScores();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;

			}
			writing = true;
			var data = JSON.stringify(this.scores);
			fs.writeFile('scores.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('scores.json.0', 'scores.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('scores.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeReminders: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeReminders();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.reminders);
			fs.writeFile('reminders.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('reminders.json.0', 'reminders.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('reminders.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
	writeMessages: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeMessages();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;

			}
			writing = true;
			var data = JSON.stringify(this.messages);
			fs.writeFile('messages.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('messages.json.0', 'messages.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('messages.json', data, finishWriting);
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

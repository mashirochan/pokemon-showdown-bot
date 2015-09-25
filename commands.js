var http = require('http');
var sys = require('sys');

if (config.serverid === 'showdown') {
	var https = require('https');
	var csv = require('csv-parse');
}

exports.commands = {
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Help commands /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    

	git: function(arg, by, room, con) {
		var text = config.excepts.indexOf(toId(by)) < 0 ? '/pm ' + by + ', ' : '';
		text += '__' + config.nick + '__ source code: ' + config.fork;
		this.say(con, room, text);
	},
	guide: 'commands',
	help: 'commands',
	commands: function(arg, by, room, con) {
		this.say(con, room, 'Commands for ' + config.nick + ': ' + config.botguide);
	},
	about: function(arg, by, room, con) {
		if (!this.hasRank(by, ' +%@&#~') || room.charAt(0) === ',') return false;
		this.say(con, room, '__' + config.nick + '__ is a bot that was created with the use of Mashiro-chan\'s Pokemon Showdown Bot shell. Original code is property of TTT.');
	},

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Developer commands ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////        

	reload: 'update',
	update: function(arg, by, room, con) {
		if (!this.hasRank(by, '~')) return false;
		try {
			this.uncacheTree('./commands.js');
			Commands = require('./commands.js').commands;
			this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__Commands updated!__');
		}
		catch (e) {
			error('failed to update: ' + sys.inspect(e));
		}
	},
	say: function(arg, by, room, con) {
		if (!this.hasRank(by, '~')) return false;
		if (arg.indexOf(", ") == -1) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__No room has been specified!__');
		var input = arg.split(", ");
		var tarRoom = input[0];
		var message = input[1];
		this.say(con, tarRoom, message);
	},
	js: function(arg, by, room, con) {
		if (!this.hasRank(by, '~')) return false;
		try {
			var result = eval(arg.trim());
		}
		catch (e) {
			this.say(con, room, e.name + ": " + e.message);
		}
	},
	
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Moderation commands ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////        
	
	ab: 'blacklist',
	autoban: 'blacklist',
	blacklist: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.userlog) this.userlog = {};
		if (!arg || arg.length > 18) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__A username must be input!__');
		var user = toId(arg);
		if (this.userlog[user] && this.userlog[user]["bl"] && this.userlog[user]["bl"] == true) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__This user is already in the blacklist!__');
		if (!this.userlog[user]) this.userlog[user] = {};
		this.userlog[user]["bl"] = true;
		this.writeUserlog();
		this.say(con, room, 'User \"' + arg + '\" has been added to the blacklist!');
	},
	unab: 'unblacklist',
	unautoban: 'unblacklist',
	unblacklist: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.userlog) this.userlog = {};
		if (!arg || arg.length > 18) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__A username must be input!__');
		var user = toId(arg);
		if (this.userlog[user] && this.userlog[user]["bl"] && this.userlog[user]["bl"] == false) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__This user is not in the blacklist!__');
		if (!this.userlog[user]) this.userlog[user] = {};
		this.userlog[user]["bl"] = false;
		this.writeUserlog();
		this.say(con, room, 'User \"' + arg + '\" has been removed from the blacklist!');
	},
	banphrase: 'banword',
	banword: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedWords["words"]) this.bannedWords["words"] = [];
		this.bannedWords["words"].push(arg.toLowerCase());
		this.writeBannedWords();
		this.say(con, room, 'Phrase \"' + arg + '\" has been added to the banned words list!');
	},
	bansite: 'banwebsite',
	banwebsite: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedSites["sites"]) this.bannedSites["sites"] = [];
		this.bannedSites["sites"].push(arg.toLowerCase());
		this.writeBannedSites();
		this.say(con, room, 'Site \"' + arg + '\" has been added to the banned sites list!');
	},
	unbanphrase: 'unbanword',
	unbanword: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedWords["words"]) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__There are no banned phrases ;~;__');
		var wordFound = false;
		for (var i in this.bannedWords["words"]) {
			if (toId(this.bannedWords["words"][i]) == toId(arg)) {
				wordFound = true;
				this.bannedWords["words"].splice(i, 1);
				this.writeBannedWords();
			}
		}
		if (wordFound == true) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + 'Phrase \"' + arg + '\" has been removed from the banlist.');
		this.say(con, room, 'Phrase \"' + arg + '\" is not currently banned.');
	},
	unbansite: 'unbanwebsite',
	unbanwebsite: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedSites["sites"]) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__There are no banned sites ;~;__');
		var siteFound = false;
		for (var i in this.bannedSites["sites"]) {
			if (toId(this.bannedSites["sites"][i]) == toId(arg)) {
				siteFound = true;
				this.bannedSites["sites"].splice(i, 1);
				this.writeBannedSites();
			}
		}
		if (siteFound == true) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + 'Website \"' + arg + '\" has been removed from the banlist.');
		this.say(con, room, 'Website \"' + arg + '\" is not currently banned.');
	},
	viewbannedphrases: 'viewbannedwords',
	vbw: 'viewbannedwords',
	viewbannedwords: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedWords["words"] || this.bannedWords["words"] == []) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__There are no banned websites!__');
		this.uploadToHastebin(con, room, by, 'Banned phrases: ' + this.bannedWords["words"].join(', '));
	},
	viewbannedsites: 'viewbannedwebsites',
	vbs: 'viewbannedwebsites',
	viewbannedwebsites: function(arg, by, room, con) {
		if (!this.hasRank(by, '@#&~')) return false;
		if (!this.bannedSites["sites"] || this.bannedSites["sites"] == []) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__There are no banned websites!__');
		this.uploadToHastebin(con, room, by, 'Banned websites: ' + this.bannedSites["sites"].join(', '));
	},
	userlog: function(arg, by, room, con) {
		if (!this.userlog) this.userlog = {};
		if (!this.userlog) this.userlog = [];
		var user = toId(arg);
		if (!this.userlog[user]) return this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + '__Not Blacklisted__ | __Warns__: 0 | __Mutes__: 0 | __Bans__: 0');
		var bl;
		var warns;
		var mutes;
		var bans;
		if (!this.userlog[user]["bl"]) bl = false;
		else bl = this.userlog[user]["bl"];
		if (!this.userlog[user]["warns"]) warns = 0;
		else warns = this.userlog[user]["warns"];
		if (!this.userlog[user]["mutes"]) mutes = 0;
		else mutes = this.userlog[user]["mutes"];
		if (!this.userlog[user]["bans"]) bans = 0;
		else bans = this.userlog[user]["bans"];
		if (bl == true) bl = '**Blacklisted**';
		else bl = '__Not Blacklisted__';
		this.say(con, room, (room.charAt(0) === ',' ? '' : '/pm ' + toId(by) + ', ') + bl + ' | __Warns__: ' + warns + ' | __Mutes__: ' + mutes + ' | __Bans__: ' + bans);
	},
};

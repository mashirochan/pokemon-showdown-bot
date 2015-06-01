# pokemon-showdown-bot
A bot shell for Pokemon Showdown created by Mashiro-chan with code from TTT.

## Setting Up Your Bot

##### Create An Account
Create an account for your bot on PS, pick a username, and register it with a password of your choice.

##### Download Files
Download all of these files and put them somewhere on your computer in a folder, preferrable named after your bot.

##### Download Node.js
To run your bot, you must first download a program called [node.js](https://nodejs.org/download/).
Once it is downloaded, find ```Node.js command prompt``` and run it.
Type ```npm install``` in the terminal window that opened up.

##### Edit the Config File
First off, you should rename ```config-example.js``` to just ```config.js```.
Here are a list of things to look over:
* ```exports.server``` should be ```'sim.smogon.com'``` if you plan on connecting to the main PS server
* ```exports.port``` should be ```8000``` for main PS server
* ```exports.serverid``` should be ```'showdown'```
* ```exports.nick``` is the username of your bot's account
  * Example: ```'MashiBot'```
* ```exports.pass``` is the password that you gave to your bot's account
  * Example: ```'MashiBotPassword'```
* ```exports.rooms``` is the names of the rooms that you want the bot to join
  * Exmaple: ```'tech', 'moba', 'thp'``` 
* ```exports.privaterooms``` is the names of private rooms that you want the bot to join
* ```exports.commandcharacter``` is what character you want your bot to use for commands
  * Example: ```'#'```
* ```exports.defaultrank``` is the lowest rank users that are able to use your bot
  * Example: ```' '``` (would allow any user to use the bot's commands)
* ```exports.excepts``` is the users that can use any command of your bot, no matter their rank
  * Example: ```'mashirochan'```
* ```exports.whitelist``` is the users that cannot be banned by your bot
  * Example: ```'leinfiniti', 'aikachan', 'yoshinokun'```
* ```exports.botguide``` is the link to a guide for your bot (I recommend using Pastebin)
  * Example: ```'http://pastebin.com/QGrSXCQ3'```
* ```exports.fork``` is the link to your bot's GitHub page
  * Example: ```'https://github.com/mashirochan/MashiBot'```
* ```exports.avatarNumber``` is the number of the avatar that you want your bot to have
  * Example: ```'155'```

##### Editing the Package File
The ```package.json``` lists information about the bot. Some things to change are:
  * ```"name"``` is the name of your bot
  * ```"url"``` is the link to your bot's GitHub repository
  * ```"name"``` the second name is your username

## Running Your Bot
To run your bot, run ```Node.js command prompt```. Next, find the file path to your bot's folder. For example, mine is saved on my desktop so the file path is "C:\Users\Mashiro\Desktop\MashiBot\Pokemon-Showdown-Bot-master".
In the terminal window type ```cd [your file path]```, and then press Enter.
Next, type ```node main.js``` to start your bot. You should see things start to pop up, confirming connection to the server and also the joining of the rooms that it was assigned to join.

## Making Commands

##### Function Overview
The standard syntax for a command function is as follows:
```javascript
[function name]: function(arg, by, room, con) { [function code] },
```
* ```arg``` is what is input by a user after the command name
  * Example: For '#test hi', ```arg``` would be 'hi'
* ```by``` is the user that said the command
  * Example: If I said '#test', ```by``` would be '+Mashiro-chan'
* ```room``` is the room that the command was used in
  * Example: If I was in the Tech & Code room, ```room``` would be 'techcode'
* ```con``` is the connection of the bot

##### Outputting Things
The standard syntax for outputting words and data is as follows:
```javascript
this.say(con, room, '[text you want to output]');
```

##### Restricting Commands
  * To restrict a command to only users of a certain rank, use the ```hasRank``` function:
```javascript
if (!this.hasRank(by, '#~')) return false;
```
This is saying that if the user that uses the command does not have a rank of # or ~, then return ```false```, ending the function.

  * Another way to check if a user can use a command is the ```canUse``` function:
```javascript
if (!this.canUse('[function name]', room, by)) return false;
```
There is a command called ```set``` which sets the required ranks for commands. What ```canUse``` does is takes the user's rank and checks the ```settings.json``` file to see if the user has at least the rank that was set with the ```set``` command. So for example if the command ```test``` was set to @ with ```set```, and the user had a rank of +, ```canUse``` would return ```false```, ending the function.

###### Example Command

```javascript
say: function(arg, by, room, con) {
		if (!this.canUse('say', room, by)) return false;
		this.say(con, room, arg);
},
```
Let's say it's a nice, warm summer day and a user is sitting in their basement on PS, chatting in the Tech & Code room, under the username MashiIsCool3327. Their rank is ~, and the ```set``` command was used to set ```say``` to #. If they were to type "#say Hello" in the chat, the function would first call the ```canUse``` function. ```by```, aka the user, has a rank of ~, which is higher than #, in the ```room```, aka 'techcode', so the function returns ```true```. Since ```!true``` is ```false```, the function does not return ```false``` and continues. Remember how I told you how to output stuff up above? Well the function uses ```this.say``` to output the ```arg```, aka 'Hello', in the ```room```, aka 'techcode'. *Spooky!*

##Useful Functions
There are several functions that make your life as a programmer much, much easier. Some are defined in the bot's code, but most of them are pre-defined functions that are commonly used in JavaScript.

##### toId
```toId``` is a function that takes in a ```string``` parameter and puts it in all lowercase, as well as removes all spaces and anything that isn't a number or letter.
```JavaScript
toId(arg)
```
```arg``` is the string that you want to pass into the ```toId``` function.

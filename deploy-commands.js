// deploy-commands.js
require('dotenv').config();  // Load .env variables at the very top

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Debug print to verify environment variables
console.log('CLIENT_ID:', process.env.CLIENT_ID);
console.log('GUILD_ID:', process.env.GUILD_ID);
console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? '[token loaded]' : '[token missing]');

// Load commands from your commands folder
const commands = [];
const commandsPath = path.join(__dirname, 'commands');  // adjust if your commands are somewhere else
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
      throw new Error('CLIENT_ID or GUILD_ID not set in environment variables.');
    }

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing commands:', error);
  }
})();

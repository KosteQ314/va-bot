const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabaseClient');
const fetch = require('node-fetch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight by departure and arrival ICAO')
    .addStringOption(option => option.setName('departure').setDescription('Departure airport ICAO').setRequired(true))
    .addStringOption(option => option.setName('arrival').setDescription('Arrival airport ICAO').setRequired(true)),

  async execute(interaction) {
    const departure = interaction.options.getString('departure').toUpperCase();
    const arrival = interaction.options.getString('arrival').toUpperCase();

    // Create or get pilot profile
    let { data: pilots, error: pilotError } = await supabase
      .from('pilots')
      .select('id')
      .eq('discord_id', interaction.user.id)
      .limit(1);

    if (pilotError) {
      console.error('Supabase pilot lookup error:', pilotError);
      return interaction.reply({ content: 'Error checking your pilot profile.', ephemeral: true });
    }

    let pilotId;
    if (pilots.length === 0) {
      const { data, error } = await supabase
        .from('pilots')
        .insert([{ discord_id: interaction.user.id, username: interaction.user.username }])
        .select('id')
        .single();

      if (error) {
        console.error('Supabase pilot create error:', error);
        return interaction.reply({ content: 'Error creating your pilot profile.', ephemeral: true });
      }
      pilotId = data.id;
    } else {
      pilotId = pilots[0].id;
    }

    await interaction.reply(`Starting to track your flight from ${departure} to ${arrival}...`);

    try {
      const response = await fetch(process.env.ATC24_API_URL, {
        headers: { 'Authorization': `Bearer ${process.env.ATC24_API_KEY}` }
      });
      if (!response.ok) throw new Error('Failed to fetch ATC24 data');
      const data = await response.json();

      // Find aircraft by matching pilot username (this might need improvement based on your setup)
      const aircraft = Object.values(data).find(ac => ac.playerName === interaction.user.username);
      if (!aircraft) {
        await interaction.followUp('Could not find your aircraft in ATC24 data.');
        return;
      }

      const altitude = aircraft.altitude;
      const groundSpeed = aircraft.groundSpeed;

      await interaction.followUp(`Your current altitude is ${altitude} ft and groundspeed is ${groundSpeed} knots.`);

      // TODO: Add polling logic for takeoff/landing detection & flight logging

    } catch (error) {
      console.error(error);
      await interaction.followUp('Error accessing ATC24 API.');
    }
  }
};

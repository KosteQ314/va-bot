const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabaseClient');
const fetch = require('node-fetch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startlogging')
    .setDescription('Start logging a flight by tracking your aircraft callsign')
    .addStringOption(opt => opt.setName('callsign').setDescription('Your aircraft callsign').setRequired(true)),

  async execute(interaction) {
    const callsign = interaction.options.getString('callsign').toUpperCase();

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

    await interaction.reply(`Started tracking flight for callsign **${callsign}**. Keep this message open.`);

    let flightStarted = false;
    let takeoffTime = null;
    let landingTime = null;
    const pollingInterval = 15000; // 15 seconds

    // Polling function
    const poll = async () => {
      try {
        const res = await fetch(process.env.ATC24_API_URL, {
          headers: { 'Authorization': `Bearer ${process.env.ATC24_API_KEY}` }
        });
        if (!res.ok) throw new Error('Failed to fetch ATC24 data');
        const data = await res.json();

        // Find aircraft by callsign
        const aircraft = Object.values(data).find(ac => ac.callsign === callsign);
        if (!aircraft) {
          await interaction.followUp(`Could not find aircraft with callsign ${callsign}.`);
          clearInterval(timer);
          return;
        }

        const alt = aircraft.altitude;
        const gs = aircraft.groundSpeed;

        if (!flightStarted) {
          if (alt > 500 && gs > 100) {
            flightStarted = true;
            takeoffTime = new Date();
            await interaction.followUp('Takeoff detected! Tracking flight...');
          } else {
            await interaction.followUp('Waiting for takeoff...');
          }
        } else {
          if (alt < 500 && gs < 50) {
            landingTime = new Date();
            const durationMs = landingTime - takeoffTime;
            const durationISO = new Date(durationMs).toISOString().substr(11, 8);

            // Save flight record with minimal info (no route here)
            const { error } = await supabase.from('flights').insert([{
              pilot_id: pilotId,
              route_id: null,
              departure_icao: null,
              arrival_icao: null,
              takeoff_time: takeoffTime.toISOString(),
              landing_time: landingTime.toISOString(),
              distance_nm: null,
              duration: durationISO,
            }]);

            if (error) {
              console.error('Error saving flight:', error);
              await interaction.followUp('Failed to save flight record.');
            } else {
              await interaction.followUp(`Flight logged! Duration: ${durationISO}`);
            }

            clearInterval(timer);
          } else {
            await interaction.followUp('Flight in progress...');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        await interaction.followUp('Error polling ATC24 API.');
        clearInterval(timer);
      }
    };

    const timer = setInterval(poll, pollingInterval);
    poll();
  },
};

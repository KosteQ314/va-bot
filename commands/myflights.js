const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabaseClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('myflights')
    .setDescription('Show your logged flights'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Find pilot by Discord ID in pilots table
    const { data: pilots, error: pilotError } = await supabase
      .from('pilots')
      .select('id')
      .eq('discord_id', interaction.user.id)
      .limit(1);

    if (pilotError) {
      console.error('Supabase pilot lookup error:', pilotError);
      return interaction.editReply('Error looking up your pilot profile.');
    }

    if (!pilots.length) {
      return interaction.editReply('You have no pilot profile yet.');
    }

    const pilotId = pilots[0].id;

    // Get flights for this pilot, join with route name
    const { data: flights, error: flightsError } = await supabase
      .from('flights')
      .select('id, departure_icao, arrival_icao, takeoff_time, landing_time, duration, distance_nm, route_id')
      .eq('pilot_id', pilotId)
      .order('takeoff_time', { ascending: false })
      .limit(10);

    if (flightsError) {
      console.error('Supabase flights fetch error:', flightsError);
      return interaction.editReply('Error fetching your flights.');
    }

    if (!flights.length) {
      return interaction.editReply('You have no logged flights yet.');
    }

    // Format flights info
    const flightsList = flights.map(f => {
      const takeoff = f.takeoff_time ? new Date(f.takeoff_time).toLocaleString() : 'N/A';
      const landing = f.landing_time ? new Date(f.landing_time).toLocaleString() : 'N/A';
      const dist = f.distance_nm ? `${f.distance_nm.toFixed(1)} NM` : 'N/A';
      const dur = f.duration ? f.duration : 'N/A';
      return `✈️ ${f.departure_icao} → ${f.arrival_icao}\nTakeoff: ${takeoff}\nLanding: ${landing}\nDistance: ${dist}\nDuration: ${dur}`;
    }).join('\n\n');

    await interaction.editReply(`Your last ${flights.length} flights:\n\n${flightsList}`);
  },
};

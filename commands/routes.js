const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabaseClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('routes')
    .setDescription('List all available routes'),

  async execute(interaction) {
    await interaction.deferReply();

    const { data: routes, error } = await supabase
      .from('routes')
      .select('id, name, departure_icao, arrival_icao, expected_time')
      .order('id', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      await interaction.editReply('Failed to fetch routes.');
      return;
    }

    if (!routes.length) {
      await interaction.editReply('No routes found.');
      return;
    }

    const routesList = routes
      .map(r => `**ID:** ${r.id} | **${r.name}**: ${r.departure_icao} → ${r.arrival_icao} | ETA: ${r.expected_time ?? 'N/A'}`)
      .join('\n');

    await interaction.editReply(`Available Routes:\n${routesList}`);
  },
};

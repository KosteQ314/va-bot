const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const supabase = require('../supabaseClient');

const ADMIN_ROLE_ID = '1404238858626793482'; // Replace with your admin role ID or handle dynamically | + role from VAMS server

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createflight')
    .setDescription('Create a new flight route')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Route name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('departure')
        .setDescription('Departure airport ICAO')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('arrival')
        .setDescription('Arrival airport ICAO')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('waypoints')
        .setDescription('Comma-separated waypoints')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('expected_time')
        .setDescription('Expected time (e.g., 01:30:00)')
        .setRequired(false)),

  async execute(interaction) {
    // Check admin role
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const name = interaction.options.getString('name');
    const departure = interaction.options.getString('departure').toUpperCase();
    const arrival = interaction.options.getString('arrival').toUpperCase();
    const waypointsRaw = interaction.options.getString('waypoints') || '';
    const expectedTime = interaction.options.getString('expected_time');

    // Parse waypoints into array
    const waypoints = waypointsRaw.split(',').map(wp => wp.trim()).filter(Boolean);

    // Confirm route creation and role assignment UI
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('assignRole')
          .setPlaceholder('Select roles allowed to manage this route')
          .addOptions([
            { label: 'Pilots', value: 'pilots' },
            { label: 'Dispatch', value: 'dispatch' },
            { label: 'Admins', value: 'admins' },
          ]),
      );

    await interaction.reply({ content: `Creating route **${name}** from ${departure} to ${arrival}. Select role to assign permissions:`, components: [row], ephemeral: true });

    // Wait for role selection interaction
    const filter = i => i.customId === 'assignRole' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async i => {
      const selectedRole = i.values[0];

      // Save to Supabase
      const { data, error } = await supabase.from('routes').insert([{
        name,
        departure_icao: departure,
        arrival_icao: arrival,
        waypoints,
        expected_time: expectedTime,
        created_by: interaction.user.id, // you might want to link this properly to pilots table
      }]);

      if (error) {
        console.error('Supabase insert error:', error);
        await i.update({ content: 'Failed to create route.', components: [] });
        return;
      }

      await i.update({ content: `Route **${name}** created successfully and assigned to role: **${selectedRole}**.`, components: [] });
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({ content: 'No role selected. Route creation cancelled.', components: [] });
      }
    });
  },
};

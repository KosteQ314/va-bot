const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabaseClient');
const fetch = require('node-fetch');

// Simple haversine formula to calculate distance in nautical miles
function haversineNm(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 3440.1; // Radius of Earth in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Replace with your real airport coordinates
const airportCoords = {
  IRFD: { lat: 40.1, lon: -74.2 },
  IPPH: { lat: 33.6, lon: 73.0 },
  ILAR: { lat: 42.3, lon: -71.1 },
  IZOL: { lat: 41.8, lon: -87.6 },
  ITKO: { lat: 45.3, lon: -75.7 },
  IMLR: { lat: 39.9, lon: -75.2 },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight by departure, arrival ICAO, and aircraft callsign')
    .addStringOption(opt => opt.setName('departure').setDescription('Departure ICAO').setRequired(true))
    .addStringOption(opt => opt.setName('arrival').setDescription('Arrival ICAO').setRequired(true))
    .addStringOption(opt => opt.setName('callsign').setDescription('Aircraft callsign').setRequired(true)),

  async execute(interaction) {
    const departure = interaction.options.getString('departure').toUpperCase();
    const arrival = interaction.options.getString('arrival').toUpperCase();
    const callsign = interaction.options.getString('callsign');

    // Create or get pilot profile
    let { data: pilots, error: pilotError } = await supabase
      .from('pilots').select('id').eq('discord_id', interaction.user.id).limit(1);
    if (pilotError) {
      console.error('Supabase pilot lookup error:', pilotError);
      return interaction.reply({ content: 'Error checking your pilot profile.', ephemeral: true });
    }

    let pilotId;
    if (pilots.length === 0) {
      const { data, error } = await supabase
        .from('pilots').insert([{ discord_id: interaction.user.id, username: interaction.user.username }])
        .select('id').single();
      if (error) {
        console.error('Supabase pilot create error:', error);
        return interaction.reply({ content: 'Error creating your pilot profile.', ephemeral: true });
      }
      pilotId = data.id;
    } else {
      pilotId = pilots[0].id;
    }

    await interaction.reply(`Tracking your flight from ${departure} to ${arrival}. Please keep this message open.`);

    let flightStarted = false;
    let takeoffTime = null;
    let landingTime = null;
    const pollingInterval = 15000; // 15 seconds

    // Calculate distance between airports
    if (!airportCoords[departure] || !airportCoords[arrival]) {
      return interaction.followUp('Unknown departure or arrival ICAO code. Please check your input.');
    }
    const distance = haversineNm(
      airportCoords[departure].lat,
      airportCoords[departure].lon,
      airportCoords[arrival].lat,
      airportCoords[arrival].lon
    );

    // Polling function
    const poll = async () => {
      try {
        const res = await fetch(process.env.ATC24_API_URL, {
          headers: { 'Authorization': `Bearer ${process.env.ATC24_API_KEY}` }
        });
        if (!res.ok) throw new Error('Failed to fetch ATC24 data');
        const data = await res.json();

        // Find user's aircraft by pilot's username
        const aircraft = Object.values(data).find(ac => ac.callsign === callsign);
        if (!aircraft) {
            await interaction.followUp(`Could not find aircraft with callsign ${callsign} in ATC24 data.`);
            clearInterval(timer);
            return;
        }

        const alt = aircraft.altitude;
        const gs = aircraft.groundSpeed;

        if (!flightStarted) {
          // Detect takeoff: altitude > 1000 ft and groundspeed > 50 knots (adjust thresholds as needed)
          if (alt > 500 && gs > 100) {
            flightStarted = true;
            takeoffTime = new Date();
            await interaction.followUp('Takeoff detected! Tracking flight...');
          } else {
            await interaction.followUp('Waiting for takeoff...');
          }
        } else {
          // Detect landing: altitude < 500 ft and groundspeed < 30 knots (adjust thresholds)
          if (alt < 500 && gs < 50) {
            landingTime = new Date();
            const durationMs = landingTime - takeoffTime;
            const durationISO = new Date(durationMs).toISOString().substr(11, 8);

            // Save flight record in Supabase
            const { error } = await supabase.from('flights').insert([{
              pilot_id: pilotId,
              route_id: null, // Add route linking logic if available
              departure_icao: departure,
              arrival_icao: arrival,
              takeoff_time: takeoffTime.toISOString(),
              landing_time: landingTime.toISOString(),
              distance_nm: distance,
              duration: durationISO,
            }]);

            if (error) {
              console.error('Error saving flight:', error);
              await interaction.followUp('Failed to save flight record.');
            } else {
              await interaction.followUp(`Flight logged! Duration: ${durationISO}, Distance: ${distance.toFixed(1)} NM`);
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

    // Start polling immediately and every 15 seconds
    const timer = setInterval(poll, pollingInterval);
    poll();
  },
};

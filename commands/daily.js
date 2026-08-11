const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Reclama tu recompensa diaria de monedas'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const cooldownTime = 24 * 60 * 60 * 1000; // 24 horas
        const lastDaily = await db.get(`lastDaily_${userId}`) || 0;
        const now = Date.now();

        if (now - lastDaily < cooldownTime) {
            const timeLeft = Math.ceil((cooldownTime - (now - lastDaily)) / (1000 * 60 * 60));
            return interaction.reply({ 
                content: `⏳ Ya has reclamado tu recompensa diaria. Vuelve en **${timeLeft} horas** canales.`, 
                ephemeral: true 
            });
        }

        const premio = 500;
        await db.add(`balance_${userId}`, premio);
        await db.set(`lastDaily_${userId}`, now);

        const embed = new EmbedBuilder()
            .setTitle('🎁 Recompensa Diaria')
            .setDescription(`¡Has reclamado exitosamente tus **${premio}** monedas de hoy!`)
            .setColor('#4ade80');

        await interaction.reply({ embeds: [embed] });
    },
};
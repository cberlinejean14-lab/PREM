const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Consulta tus monedas o las de otro usuario')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario cuyo balance deseas ver')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const balance = await db.get(`balance_${targetUser.id}`) || 0;

        const embed = new EmbedBuilder()
            .setTitle(`💼 Balance de ${targetUser.username}`)
            .setDescription(`Actualmente tiene **${balance}** monedas.`)
            .setColor('#a855f7')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

        await interaction.reply({ embeds: [embed] });
    },
};
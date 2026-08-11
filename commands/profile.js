const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Muestra tu tarjeta de perfil interactiva y exclusiva de PREM')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('Consulta el perfil de otro usuario')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const userId = targetUser.id;

        // Consultar datos de la base de datos
        const hasPrivacyBadge = await db.get(`badge_privacy_${userId}`);
        const userBalance = await db.get(`balance_${userId}`) || 0;
        
        // Datos de nivel y XP
        const userXp = await db.get(`xp_${userId}`) || 0;
        const currentLevel = Math.floor(userXp / 1000) + 1;
        const xpForNextLevel = currentLevel * 1000;
        const currentLevelXp = userXp % 1000;

        // Barra de progreso visual para el nivel
        const progressPercentage = Math.min(Math.max(currentLevelXp / 1000, 0), 1);
        const filledBlocks = Math.round(progressPercentage * 10);
        const emptyBlocks = 10 - filledBlocks;
        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        // Estilo dinámico para las insignias
        const badgesList = hasPrivacyBadge 
            ? '` 💎 ` **PREM Early Supporter**\n` 🛡️ ` **Términos de Privacidad Verificados**' 
            : '` 🔒 ` *Sin insignias desbloqueadas*\n> *💡 Acepta las políticas en la web de PREM para reclamar la tuya.*';

        const embed = new EmbedBuilder()
            .setColor('#a855f7')
            .setAuthor({ 
                name: `✨ PREM NETWORK // ID: ${userId}`, 
                iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
            })
            .setTitle(`__TARJETA DE IDENTIDAD // ${targetUser.username.toUpperCase()}__`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(
                `╭──────────────────────────╮\n` +
                `   🔹 **RANGO GLOBAL:** \`#--\`\n` +
                `   🔹 **ESTADO:** \`🟢 En Línea\`\n` +
                `╰──────────────────────────╯`
            )
            .addFields(
                { 
                    name: '📊 PROGRESO DE NIVEL', 
                    value: `> **Nivel:** \`${currentLevel}\` | **XP:** \`${currentLevelXp}/${xpForNextLevel}\`\n> \`${progressBar}\` (${Math.floor(progressPercentage * 100)}%)`, 
                    inline: false 
                },
                { 
                    name: '💳 BALANCE FINANCIERO', 
                    value: `> 🪙 **Wallet:** \`${userBalance.toLocaleString()} Coins\`\n> 🏦 **Banco:** \`0 Coins\``, 
                    inline: true 
                },
                { 
                    name: '⚡ ACTIVIDAD', 
                    value: `> 🎮 **Estado:** \`Navegando\`\n> 🎵 **Música:** \`Inactivo\``, 
                    inline: true 
                },
                { 
                    name: '🏆 RECONOCIMIENTOS Y ︎INSIGNIAS', 
                    value: `${badgesList}`, 
                    inline: false 
                }
            )
            .setImage('https://cdn.discordapp.com/attachments/1154865181144883230/1154865234240536647/line_purple.png') // Línea divisoria estética opcional
            .setFooter({ 
                text: `PREM Ecosystem • Sistema Seguro v2.6 • Solicitado por ${interaction.user.username}`, 
                iconURL: interaction.client.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
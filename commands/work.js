const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Trabaja para ganar algunas monedas'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const cooldownTime = 60 * 60 * 1000; // 1 hora
        const lastWork = await db.get(`lastWork_${userId}`) || 0;
        const now = Date.now();

        if (now - lastWork < cooldownTime) {
            const minutesLeft = Math.ceil((cooldownTime - (now - lastWork)) / (1000 * 60));
            return interaction.reply({ 
                content: `🛑 Estás cansado. Debes descansar **${minutesLeft} minutos** antes de volver a trabajar.`, 
                ephemeral: true 
            });
        }

        const trabajos = [
            "programador de bots de Discord",
            "moderador de servidores",
            "diseñador gráfico",
            "re repartidor de pizzas",
            "creador de contenido"
        ];
        
        const trabajoAleatorio = trabajos[Math.floor(Math.random() * trabajos.length)];
        const ganancias = Math.floor(Math.random() * 150) + 50; // Entre 50 y 200 monedas

        await db.add(`balance_${userId}`, ganancias);
        await db.set(`lastWork_${userId}`, now);

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Jornada de Trabajo')
            .setDescription(`Trabajaste como **${trabajoAleatorio}** y ganaste **${ganancias}** monedas.`)
            .setColor('#a855f7');

        await interaction.reply({ embeds: [embed] });
    },
};
// Middleware para verificar si el usuario ha iniciado sesión
function checkAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    // Si no está logueado, lo mandamos a la ruta de inicio de sesión con Discord
    res.redirect('/auth/discord');
}

// Middleware para verificar si el usuario es administrador del servidor
async function checkAdmin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.redirect('/auth/discord');
    }

    const guildId = req.params.guildId;
    // Asegúrate de que req.user.guilds exista en tu estrategia de Passport
    const userGuilds = req.user.guilds; 

    const guild = userGuilds.find(g => g.id === guildId);
    
    // Validamos si el usuario es administrador (permiso 0x8) o dueño del servidor
    const isAdmin = guild && ((guild.permissions & 0x8) === 0x8 || guild.owner);

    if (isAdmin) {
        return next();
    } else {
        // En lugar de enviar un texto, renderizamos la vista de error
        return res.status(403).render('access-denied');
    }
}

/**
 * NUEVO: Middleware de seguridad estricta para el Panel Manager.
 * Evita que herramientas externas (como Postman) o usuarios sin permisos 
 * puedan ejecutar acciones POST/GET en las rutas protegidas.
 */
function checkManagerSecure(db, tuIdDeDiscord) {
    return async function(req, res, next) {
        // 1. Validar si la sesión está activa
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            if (req.method === 'POST') {
                return res.status(401).json({ success: false, message: "No autenticado." });
            }
            return res.redirect('/auth/discord');
        }

        const userId = req.user.id;

        // 2. Si es la creadora principal, permitir el paso de inmediato
        if (userId === tuIdDeDiscord) {
            return next();
        }

        // 3. Validar de forma asíncrona en la base de datos si el usuario es un administrador autorizado
        try {
            const tienePermiso = await db.get(`manager_admin_${userId}`);
            if (tienePermiso) {
                return next();
            }
        } catch (error) {
            console.error("Error al verificar permisos en auth.js:", error);
        }

        // 4. Si no tiene permisos, bloquear según el tipo de petición
        if (req.method === 'POST') {
            return res.status(403).json({ success: false, message: "Acceso denegado. No tienes privilegios de Manager." });
        }
        
        return res.status(403).send('Acceso denegado. No tienes permisos para ver esta sección.');
    };
}

module.exports = { checkAuth, checkAdmin, checkManagerSecure };
import { supabase } from './supabase'

// Simulación en lugar de usar Twilio (para proyecto escolar)
export const sendSMS = async (phoneNumber, message) => {
  // Simulamos el envío exitoso y solo registramos en consola
  console.log("SIMULACIÓN DE SMS - No se enviará realmente");
  console.log(`SMS para: ${phoneNumber}`);
  console.log(`Mensaje: ${message}`);
  console.log("---------------------------------");
  
  // Mostrar alerta para fines de demostración
  setTimeout(() => {
    alert(`[SIMULACIÓN] SMS enviado a ${phoneNumber}:\n${message}`);
  }, 500);
  
  return true; // Siempre retornamos éxito
}

export const notifyUserAboutBin = async (userId, binName, fillLevel) => {
  if (!userId || !binName) {
    console.error("Faltan datos para la notificación");
    return false;
  }

  try {
    // Preparar el mensaje según el nivel de llenado
    let message;
    if (fillLevel >= 100) {
      message = `🚨 ¡ALERTA CRÍTICA! El basurero "${binName}" ha alcanzado su capacidad máxima (100%). Requiere atención inmediata.`;
    } else if (fillLevel >= 80) {
      message = `⚠️ ¡Atención! El basurero "${binName}" está alcanzando su capacidad máxima (${Math.round(fillLevel)}%). Por favor, programe su recolección pronto.`;
    } else {
      return false; // No notificar si no es un nivel crítico
    }

    // Obtener el número de teléfono (de los metadatos del usuario)
    let phoneNumber = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      
      if (user?.user_metadata?.phone_number) {
        phoneNumber = user.user_metadata.phone_number;
      } else {
        phoneNumber = "NÚMERO_SIMULADO";
      }
    } catch (error) {
      phoneNumber = "NÚMERO_SIMULADO";
      console.warn("Error al obtener datos del usuario, usando número simulado");
    }

    // Simular envío
    return await sendSMS(phoneNumber, message);
  } catch (error) {
    console.error('Error en notificación SMS:', error);
    return false;
  }
}

// Función para pruebas manuales de notificaciones
export const testSMSNotification = async (phoneNumber = "NÚMERO_SIMULADO", level = 85) => {
  const testMessage = level >= 100
    ? "🚨 PRUEBA DE ALERTA CRÍTICA (100%): Esta es una prueba de notificación de basurero lleno."
    : `⚠️ PRUEBA DE ALERTA (${level}%): Esta es una prueba de notificación de nivel de basurero.`;
  
  const result = await sendSMS(phoneNumber || "NÚMERO_SIMULADO", testMessage);
  return {
    success: result,
    message: "SMS de prueba simulado correctamente"
  };
}

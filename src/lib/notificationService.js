// Usar notificaciones nativas del navegador

let swRegistration = null;

// Verificar si las notificaciones están disponibles en este navegador
const notificationsAvailable = () => {
  const available = 'Notification' in window && 'serviceWorker' in navigator;
  if (!available) {
    console.warn("API de Notificaciones o Service Worker no disponible en este navegador");
  }
  return available;
}

// Registrar el Service Worker
const registerServiceWorker = async () => {
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registrado:', swRegistration);
    return true;
  } catch (error) {
    console.error('Error al registrar Service Worker:', error);
    return false;
  }
};

// Inicializar las notificaciones del navegador
export const initializeNotifications = async () => {
  try {
    // Verificar si las notificaciones están disponibles
    if (!notificationsAvailable()) {
      console.error("Las notificaciones no están disponibles en este navegador");
      return false;
    }

    // Registrar el Service Worker
    const swRegistered = await registerServiceWorker();
    if (!swRegistered) {
      return false;
    }

    // Verificar el permiso actual
    if (Notification.permission === "granted") {
      console.log("Permisos de notificación ya otorgados");
      // Enviar una notificación de prueba inmediata para confirmar
      sendTestNotification();
      return true;
    }

    if (Notification.permission === "denied") {
      console.log("Permisos de notificación denegados por el usuario");
      alert("Las notificaciones están bloqueadas. Por favor, cambia la configuración de tu navegador para permitir notificaciones de este sitio.");
      return false;
    }

    // Solicitar permiso
    console.log("Solicitando permiso para notificaciones...");
    const permission = await Notification.requestPermission();
    
    // Registrar el resultado
    console.log(`Permiso de notificación: ${permission}`);
    
    if (permission === "granted") {
      // Enviar una notificación de prueba inmediata para confirmar
      sendTestNotification();
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error al inicializar notificaciones:", error);
    return false;
  }
};

// Función para enviar una notificación de prueba inmediata
const sendTestNotification = () => {
  try {
    console.log("Enviando notificación de prueba inmediata...");
    
    if (swRegistration) {
      swRegistration.showNotification("¡Notificaciones Activadas!", {
        body: "Las notificaciones están funcionando correctamente. Recibirás alertas cuando los basureros alcancen niveles críticos.",
        icon: '/vite.svg',
        vibrate: [100, 50, 100]
      });
    } else {
      const notification = new Notification("¡Notificaciones Activadas!", {
        body: "Las notificaciones están funcionando correctamente. Recibirás alertas cuando los basureros alcancen niveles críticos.",
        icon: '/vite.svg'
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
    
    console.log("Notificación de prueba enviada");
  } catch (error) {
    console.error("Error al enviar notificación de prueba:", error);
  }
};

// Enviar una notificación
export const sendNotification = async (title, message) => {
  try {
    // Verificar si las notificaciones están disponibles y permitidas
    if (!notificationsAvailable()) {
      console.error("Las notificaciones no están disponibles en este navegador");
      return false;
    }

    // Verificar permisos
    if (Notification.permission !== "granted") {
      console.log("Solicitando permisos para notificación...");
      const permiso = await initializeNotifications();
      if (!permiso) {
        console.log("Permisos de notificación denegados");
        return false;
      }
    }

    console.log("Creando notificación:", title, message);

    // Crear y mostrar la notificación usando el Service Worker si está disponible
    if (swRegistration) {
      await swRegistration.showNotification(title, {
        body: message,
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [100, 50, 100],
        requireInteraction: true
      });
    } else {
      const notification = new Notification(title, {
        body: message,
        icon: '/vite.svg',
        badge: '/vite.svg',
        requireInteraction: true
      });

      notification.onclick = () => {
        console.log("Notificación clickeada");
        window.focus();
        notification.close();
      };
    }

    console.log("Notificación enviada correctamente");
    return true;
  } catch (error) {
    console.error("Error al enviar notificación:", error);
    return false;
  }
};

// Verificar si hay permiso actualmente
export const checkNotificationPermission = async () => {
  if (!notificationsAvailable()) return false;
  return Notification.permission === "granted";
};

// Función para pruebas
export const testBrowserNotification = async () => {
  console.log("Iniciando prueba de notificación del navegador...");
  
  const result = await sendNotification(
    "Prueba de Notificación", 
    "Esta es una prueba de las notificaciones del navegador. Si puedes ver esto, las notificaciones están funcionando correctamente."
  );
  
  console.log("Resultado de prueba de notificación:", result);
  
  return {
    success: result,
    message: result 
      ? "Notificación de prueba enviada correctamente" 
      : "Error al enviar la notificación de prueba"
  };
};

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/use-toast"
import { Trash2, AlertTriangle, LogOut, RefreshCw, Plus, User, Bell, Menu, ClipboardList } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BinChart } from "@/components/BinChart"
import { useNavigate } from "react-router-dom"
import { initializeNotifications, sendNotification, checkNotificationPermission } from "@/lib/notificationService"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

function Dashboard() {
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [trashBins, setTrashBins] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [newBinName, setNewBinName] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedBin, setSelectedBin] = useState(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false)
  const [testingNotification, setTestingNotification] = useState(false)
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false)
  const [selectedBinEvents, setSelectedBinEvents] = useState([])
  const previousLevelsRef = useRef({})
  const notificationSentRef = useRef({})
  const POLLING_INTERVAL = 10000 // 10 segundos

  const fetchTrashBins = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('trash_bins')
        .select(`
          *,
          bin_events(*)
        `)
        .order('fill_level', { ascending: false })

      if (error) throw error

      setTrashBins(data?.map(bin => ({
        ...bin,
        // Ordenar eventos por fecha de creación (más recientes primero)
        events: (bin.bin_events || []).sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        )
      })) || [])
    } catch (error) {
      console.error("Error fetching bins:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al cargar los datos de los basureros",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const subscribeToUpdates = () => {
    console.log("Iniciando suscripción a cambios en basureros...");
    
    // Buscar los niveles actuales para comparar
    const getBinLevels = () => {
      const levels = {};
      trashBins.forEach(bin => {
        levels[bin.id] = bin.fill_level;
        console.log(`Nivel inicial bin ${bin.id} (${bin.name}): ${bin.fill_level}%`);
      });
      return levels;
    };
    
    const previousLevels = getBinLevels();
    
    // Para seguimiento de estados de apertura/cierre
    const openStates = {};
    trashBins.forEach(bin => {
      openStates[bin.id] = bin.is_open;
    });
    
    // Crear y configurar el canal
    const channel = supabase
      .channel('trash_bins_channel')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'trash_bins' 
      }, async (payload) => {
        console.log("¡CAMBIO DETECTADO EN BASUREROS!", payload);
        
        // Para cualquier cambio, primero refrescar los datos
        await fetchTrashBins();
        
        // Si es una actualización, verificar cambios
        if (payload.eventType === "UPDATE") {
          const binData = payload.new;
          const oldLevel = previousLevels[binData.id] || 0;
          const newLevel = binData.fill_level;
          const oldOpenState = openStates[binData.id];
          const newOpenState = binData.is_open;
          
          console.log(`Basurero ${binData.id}: Nivel anterior ${oldLevel}%, nuevo nivel ${newLevel}%`);
          previousLevels[binData.id] = newLevel; // Actualizar para la próxima vez
          
          // Verificar si el estado de apertura cambió
          if (oldOpenState !== undefined && oldOpenState !== newOpenState) {
            console.log(`Cambio de estado: Basurero ${binData.id} ${newOpenState ? 'abierto' : 'cerrado'}`);
            
            // Registrar evento de apertura/cierre
            const { error } = await supabase
              .from('bin_events')
              .insert([{
                bin_id: binData.id,
                event_type: newOpenState ? 'APERTURA' : 'CIERRE',
                description: newOpenState ? 'Basurero abierto' : 'Basurero cerrado'
              }]);
              
            if (error) {
              console.error("Error al registrar evento de apertura/cierre:", error);
            } else {
              console.log(`✅ Evento de ${newOpenState ? 'apertura' : 'cierre'} registrado`);
              // Recargar datos para mostrar el nuevo evento
              await fetchTrashBins();
            }
            
            // Actualizar estado guardado
            openStates[binData.id] = newOpenState;
          }
          
          // Verificar si cruzó algún umbral crítico
          const crossed80Threshold = oldLevel < 80 && newLevel >= 80;
          const crossed100Threshold = oldLevel < 100 && newLevel >= 100;
          
          if (crossed80Threshold || crossed100Threshold) {
            console.log(`¡UMBRAL CRÍTICO ALCANZADO! ${binData.name || 'Basurero'} pasó de ${oldLevel}% a ${newLevel}%`);
            
            // Forzar notificación explícita
            const { sendNotification } = await import("@/lib/notificationService");
            
            const message = crossed100Threshold
              ? `🚨 ¡ALERTA CRÍTICA! El basurero ${binData.name || 'ID: ' + binData.id} está LLENO (${newLevel}%). Requiere atención inmediata.`
              : `⚠️ El basurero ${binData.name || 'ID: ' + binData.id} está alcanzando su capacidad máxima (${newLevel}%). Por favor planifique vaciarlo pronto.`;
              
            const notifSent = await sendNotification("TrashTracker Alerta", message);
            
            if (notifSent) {
              console.log("✅ Notificación enviada exitosamente");
            } else {
              console.error("❌ Error al enviar notificación");
              // Mostrar alerta en pantalla como respaldo
              toast({
                title: crossed100Threshold ? "¡ALERTA CRÍTICA!" : "¡Alerta de capacidad!",
                description: message,
                variant: crossed100Threshold ? "destructive" : "default",
              });
            }
          }
        }
      })
      .subscribe((status) => {
        console.log("Estado de suscripción:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Suscripción a cambios en basureros activa");
        } else if (status === 'CLOSED') {
          console.log("❌ Suscripción cerrada, intentando reconectar...");
          // Intentar reconectar después de un breve retraso
          setTimeout(() => {
            console.log("Intentando reconectar...");
            subscribeToUpdates();
          }, 5000);
        }
      });
      
    // Crear y configurar el canal para eventos de basurero
    const eventsChannel = supabase
      .channel('bin_events_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bin_events'
      }, async (payload) => {
        console.log("¡NUEVO EVENTO DE BASURERO!", payload);
        // Recargar los datos para incluir el nuevo evento
        await fetchTrashBins();
      })
      .subscribe((status) => {
        console.log("Estado de suscripción eventos:", status);
      });
      
    console.log("Suscripción a basureros configurada correctamente");
    return [channel, eventsChannel]; // Devolver ambos canales
  }

  const createNewBin = async () => {
    if (!newBinName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "El nombre del basurero es requerido",
      })
      return
    }

    try {
      const { data, error } = await supabase
        .from('trash_bins')
        .insert([
          {
            name: newBinName.trim(),
            fill_level: 0,
            is_open: false
          }
        ])
        .select()

      if (error) throw error

      toast({
        title: "¡Éxito!",
        description: "Basurero creado correctamente",
      })

      setNewBinName("")
      setIsDialogOpen(false)
      setMobileDialogOpen(false)
      fetchTrashBins()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al crear el basurero",
      })
    }
  }

  const deleteBin = async () => {
    if (!selectedBin) return

    try {
      const { error } = await supabase
        .from('trash_bins')
        .delete()
        .eq('id', selectedBin.id)

      if (error) throw error

      toast({
        title: "Basurero eliminado",
        description: "El basurero ha sido eliminado correctamente",
      })

      setDeleteDialogOpen(false)
      setSelectedBin(null)
      fetchTrashBins()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al eliminar el basurero",
      })
    }
  }

  const handleNotificationToggle = async () => {
    try {
      const result = await initializeNotifications()
      setNotificationsEnabled(result)
      setMenuOpen(false)
      
      if (result) {
        toast({
          title: "¡Notificaciones activadas!",
          description: "Recibirás alertas cuando los basureros necesiten atención.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron activar las notificaciones. Por favor, verifica los permisos del navegador.",
        })
      }
    } catch (error) {
      console.error("Error al activar notificaciones:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Hubo un problema al activar las notificaciones.",
      })
    }
  }

  // Función para verificar cambios en los niveles
  const checkLevelChanges = async () => {
    try {
      console.log("Verificando niveles de basureros...");
      
      const { data, error } = await supabase
        .from('trash_bins')
        .select('*');

      if (error) throw error;

      // Verificar si hay cambios en los niveles para actualizar la interfaz
      let interfaceNeedsUpdate = false;
      
      // Comparar con los datos actuales en la interfaz
      const currentBins = [...trashBins];
      const updatedBins = currentBins.map(currentBin => {
        // Buscar el mismo basurero en los datos nuevos
        const updatedBin = data.find(bin => bin.id === currentBin.id);
        
        // Si encontramos el basurero y su nivel ha cambiado
        if (updatedBin && updatedBin.fill_level !== currentBin.fill_level) {
          console.log(`Actualizando UI: Basurero ${currentBin.name} cambió de ${currentBin.fill_level}% a ${updatedBin.fill_level}%`);
          interfaceNeedsUpdate = true;
          // Devolver el bin actualizado pero mantener los eventos y otras propiedades
          return {
            ...currentBin,
            fill_level: updatedBin.fill_level,
            is_open: updatedBin.is_open,
            updated_at: updatedBin.updated_at
          };
        }
        // Si no ha cambiado, devolver el mismo
        return currentBin;
      });
      
      // Actualizar la interfaz solo si hay cambios
      if (interfaceNeedsUpdate) {
        console.log("Actualizando interfaz con nuevos niveles");
        setTrashBins(updatedBins);
      }

      // Verificar cada basurero para notificaciones
      data.forEach(bin => {
        const oldLevel = previousLevelsRef.current[bin.id] || 0;
        const newLevel = bin.fill_level;
        
        console.log(`Basurero ${bin.name}: Nivel anterior ${oldLevel}%, nivel actual ${newLevel}%`);

        // Verificar si cruzó algún umbral crítico
        const crossed80Threshold = newLevel >= 80;
        const crossed100Threshold = newLevel >= 100;
        
        // ID únicos para cada umbral y basurero
        const threshold80Id = `${bin.id}_80`;
        const threshold100Id = `${bin.id}_100`;
        
        // Para el umbral de 80%
        if (crossed80Threshold && !notificationSentRef.current[threshold80Id]) {
          console.log(`Enviando notificación para umbral 80%: ${bin.name}`);
          
          const message = `⚠️ El basurero ${bin.name} está alcanzando su capacidad máxima (${newLevel}%). Por favor planifique vaciarlo pronto.`;

          sendNotification("TrashTracker Alerta", message).then(success => {
            if (success) {
              // Marcar que ya se envió esta notificación
              notificationSentRef.current[threshold80Id] = true;
              console.log(`✅ Notificación umbral 80% enviada para ${bin.name}`);
            } else {
              toast({
                title: "¡Alerta de capacidad!",
                description: message,
                variant: "default",
              });
            }
          });
        } 
        // Para el umbral de 100%
        else if (crossed100Threshold && !notificationSentRef.current[threshold100Id]) {
          console.log(`Enviando notificación para umbral 100%: ${bin.name}`);
          
          const message = `🚨 ¡ALERTA CRÍTICA! El basurero ${bin.name} está LLENO (${newLevel}%). Requiere atención inmediata.`;

          sendNotification("TrashTracker Alerta", message).then(success => {
            if (success) {
              // Marcar que ya se envió esta notificación
              notificationSentRef.current[threshold100Id] = true;
              console.log(`✅ Notificación umbral 100% enviada para ${bin.name}`);
            } else {
              toast({
                title: "¡ALERTA CRÍTICA!",
                description: message,
                variant: "destructive",
              });
            }
          });
        }
        
        // Si el nivel baja por debajo del umbral, resetear el estado para poder enviar notificaciones nuevamente
        if (newLevel < 80) {
          if (notificationSentRef.current[threshold80Id]) {
            console.log(`Nivel por debajo de 80% para ${bin.name}, reseteando estado de notificación`);
            notificationSentRef.current[threshold80Id] = false;
          }
          if (notificationSentRef.current[threshold100Id]) {
            console.log(`Nivel por debajo de 100% para ${bin.name}, reseteando estado de notificación`);
            notificationSentRef.current[threshold100Id] = false;
          }
        } else if (newLevel < 100 && notificationSentRef.current[threshold100Id]) {
          console.log(`Nivel por debajo de 100% para ${bin.name}, reseteando estado de notificación`);
          notificationSentRef.current[threshold100Id] = false;
        }

        // Actualizar el nivel anterior de este basurero
        previousLevelsRef.current[bin.id] = newLevel;
      });

    } catch (error) {
      console.error("Error al verificar niveles:", error);
    }
  };

  // Efecto para el polling
  useEffect(() => {
    let pollingInterval;

    const startPolling = () => {
      // Primera verificación inmediata
      checkLevelChanges();
      
      // Configurar el intervalo
      pollingInterval = setInterval(checkLevelChanges, POLLING_INTERVAL);
    };

    if (notificationsEnabled) {
      startPolling();
    }

    // Limpiar el intervalo cuando el componente se desmonte o las notificaciones se desactiven
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [notificationsEnabled]); // Se reinicia cuando cambia el estado de las notificaciones

  useEffect(() => {
    let channels = [];

    const setup = async () => {
      try {
        await fetchTrashBins();
        channels = subscribeToUpdates();
        
        // Verificar permisos de notificación al inicio
        const hasPermission = await checkNotificationPermission();
        setNotificationsEnabled(hasPermission);
      } catch (error) {
        console.error("Error en setup inicial:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Error al inicializar el dashboard",
        });
      }
    };

    setup();

    // Limpiar la suscripción cuando el componente se desmonte
    return () => {
      if (channels && channels.length) {
        console.log("Limpiando suscripciones...");
        channels.forEach(channel => {
          if (channel) channel.unsubscribe();
        });
      }
    };
  }, []);

  const viewAllEvents = (bin) => {
    // Ordenar eventos por fecha de creación (más recientes primero)
    const sortedEvents = [...(bin.events || [])].sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );
    setSelectedBinEvents(sortedEvents);
    setEventsDialogOpen(true);
  };

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold gradient-text">TrashTracker</h1>
          
          {/* Menú móvil */}
          <div className="md:hidden w-full relative">
            <Button
              variant="outline"
              className="w-full flex items-center justify-between"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span>Menú</span>
              <Menu className="w-4 h-4" />
            </Button>
            
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 flex flex-col gap-2 bg-white rounded-lg p-4 shadow-lg z-50"
              >
                <Button
                  variant="outline"
                  className={`w-full flex items-center justify-start gap-2 ${
                    notificationsEnabled ? 'bg-green-50 border-green-200' : ''
                  }`}
                  onClick={handleNotificationToggle}
                >
                  <Bell className={`w-4 h-4 ${notificationsEnabled ? 'text-green-500' : ''}`} />
                  {notificationsEnabled ? 'Notificaciones Activas' : 'Activar Notificaciones'}
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-start gap-2"
                  onClick={() => {
                    navigate("/profile")
                    setMenuOpen(false)
                  }}
                >
                  <User className="w-4 h-4" />
                  Perfil
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-start gap-2"
                  onClick={() => {
                    setMobileDialogOpen(true)
                    setMenuOpen(false)
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Basurero
                </Button>

                <Button 
                  onClick={() => {
                    fetchTrashBins()
                    setMenuOpen(false)
                  }}
                  variant="outline" 
                  className="w-full flex items-center justify-start gap-2"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>

                <Button 
                  onClick={() => {
                    logout()
                    setMenuOpen(false)
                  }}
                  variant="outline" 
                  className="w-full flex items-center justify-start gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </Button>
              </motion.div>
            )}
          </div>

          {/* Menú escritorio */}
          <div className="hidden md:flex gap-4">
            <Button
              variant="outline"
              className={`flex items-center gap-2 ${
                notificationsEnabled ? 'bg-green-50 border-green-200' : ''
              }`}
              onClick={handleNotificationToggle}
            >
              <Bell className={`w-4 h-4 ${notificationsEnabled ? 'text-green-500' : ''}`} />
              {notificationsEnabled ? 'Notificaciones Activas' : 'Activar Notificaciones'}
            </Button>
            
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => navigate("/profile")}
            >
              <User className="w-4 h-4" />
              Perfil
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Nuevo Basurero
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Basurero</DialogTitle>
                  <DialogDescription>
                    Ingresa el nombre para el nuevo basurero inteligente.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    placeholder="Nombre del basurero"
                    value={newBinName}
                    onChange={(e) => setNewBinName(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={createNewBin}>
                    Crear Basurero
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={fetchTrashBins} 
              variant="outline" 
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>

            <Button onClick={logout} variant="outline" className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Dialog para móvil */}
        <Dialog open={mobileDialogOpen} onOpenChange={setMobileDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Basurero</DialogTitle>
              <DialogDescription>
                Ingresa el nombre para el nuevo basurero inteligente.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Nombre del basurero"
                value={newBinName}
                onChange={(e) => setNewBinName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMobileDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={createNewBin}>
                Crear Basurero
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Eliminación</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas eliminar el basurero "{selectedBin?.name}"? Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={deleteBin}>
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Historial de eventos</DialogTitle>
              <DialogDescription>
                Registro completo de los eventos del basurero
              </DialogDescription>
            </DialogHeader>
            
            <div className="overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                {selectedBinEvents.length > 0 ? (
                  selectedBinEvents.map((event, index) => (
                    <div 
                      key={index} 
                      className={`p-3 rounded-lg flex items-start gap-3 ${
                        event.event_type === 'APERTURA' 
                          ? 'bg-green-50 border border-green-100' 
                          : event.event_type === 'CIERRE'
                            ? 'bg-blue-50 border border-blue-100'
                            : event.event_type === 'LLENADO'
                              ? 'bg-red-50 border border-red-100'
                              : 'bg-white/50 border border-gray-100'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {event.event_type === 'APERTURA' ? (
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                            <span className="text-green-600 text-xs">▲</span>
                          </div>
                        ) : event.event_type === 'CIERRE' ? (
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 text-xs">▼</span>
                          </div>
                        ) : event.event_type === 'LLENADO' ? (
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                            <span className="text-red-600 text-xs">!</span>
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-gray-600 text-xs">i</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className={`font-medium ${
                            event.event_type === 'APERTURA'
                              ? 'text-green-700'
                              : event.event_type === 'CIERRE'
                                ? 'text-blue-700'
                                : event.event_type === 'LLENADO'
                                  ? 'text-red-700'
                                  : 'text-gray-700'
                          }`}>
                            {event.event_type || 'Evento'}
                          </span>
                          <span 
                            className="text-xs text-gray-500 whitespace-nowrap"
                            title={new Date(event.created_at).toLocaleString()}
                          >
                            {new Date(event.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{event.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No hay eventos registrados para este basurero
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setEventsDialogOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <AnimatePresence>
            {isLoading ? (
              <div className="col-span-full flex justify-center items-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : trashBins.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <p className="text-gray-500">No hay basureros registrados.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setIsDialogOpen(true)}
                >
                  Agregar nuevo basurero
                </Button>
              </div>
            ) : (
              trashBins.map((bin) => (
                <motion.div
                  key={bin.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="w-full"
                >
                  <Card className={`glass-card overflow-hidden ${
                    bin.fill_level >= 80 ? 'border-red-400 shadow-red-200' : ''
                  }`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-lg md:text-xl font-bold">{bin.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {bin.fill_level >= 80 && (
                          <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:text-red-500"
                          onClick={() => {
                            setSelectedBin(bin)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <BinChart fillLevel={bin.fill_level} />

                        <div className="flex items-center justify-center gap-2 mt-4">
                          <span>Estado:</span>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            bin.is_open 
                              ? 'bg-green-100 text-green-800 border border-green-200' 
                              : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                          }`}>
                            {bin.is_open ? 'Abierto' : 'Cerrado'}
                          </span>
                        </div>

                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold text-gray-700">Últimos eventos:</h4>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 px-2 text-xs" 
                              onClick={() => viewAllEvents(bin)}
                            >
                              <ClipboardList className="h-3.5 w-3.5 mr-1" />
                              Ver todos
                            </Button>
                          </div>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {bin.events && bin.events.length > 0 ? (
                              bin.events.slice(0, 5).map((event, index) => (
                                <div 
                                  key={index} 
                                  className={`text-sm rounded-lg p-2 flex items-center gap-2 ${
                                    event.event_type === 'APERTURA' 
                                      ? 'bg-green-50 border border-green-100' 
                                      : event.event_type === 'CIERRE'
                                        ? 'bg-blue-50 border border-blue-100'
                                        : event.event_type === 'LLENADO'
                                          ? 'bg-red-50 border border-red-100'
                                          : 'bg-white/50'
                                  }`}
                                >
                                  <span 
                                    className="text-xs text-gray-500 whitespace-nowrap"
                                    title={new Date(event.created_at).toLocaleString()}
                                  >
                                    {new Date(event.created_at).toLocaleTimeString()}
                                  </span>
                                  <span className={`${
                                    event.event_type === 'APERTURA'
                                      ? 'text-green-700'
                                      : event.event_type === 'CIERRE'
                                        ? 'text-blue-700'
                                        : event.event_type === 'LLENADO'
                                          ? 'text-red-700'
                                          : 'text-gray-700'
                                  }`}>
                                    {event.description}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 italic">No hay eventos registrados</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

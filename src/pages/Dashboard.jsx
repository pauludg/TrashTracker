import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/use-toast"
import { Trash2, AlertTriangle, LogOut, RefreshCw, Plus, User, Bell, Menu } from "lucide-react"
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
        events: bin.bin_events || []
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
        
        // Si es una actualización, verificar si cruzó umbrales
        if (payload.eventType === "UPDATE") {
          const binData = payload.new;
          const oldLevel = previousLevels[binData.id] || 0;
          const newLevel = binData.fill_level;
          
          console.log(`Basurero ${binData.id}: Nivel anterior ${oldLevel}%, nuevo nivel ${newLevel}%`);
          previousLevels[binData.id] = newLevel; // Actualizar para la próxima vez
          
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
      
    console.log("Suscripción a basureros configurada correctamente");
    return channel;
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

  const testNotification = async () => {
    try {
      setTestingNotification(true);
      console.log("Probando sistema de notificaciones del navegador...");
      
      // Si el usuario no está autenticado, no podemos continuar
      if (!user) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Debes iniciar sesión para probar las notificaciones.",
        });
        return;
      }
      
      // Importar el servicio de notificaciones
      const { testBrowserNotification } = await import("@/lib/notificationService");
      
      // Probar notificación
      const testResult = await testBrowserNotification();
      console.log("Resultado de prueba de notificación:", testResult);
      
      // Mostrar resultado en la interfaz
      if (testResult.success) {
        toast({
          title: "Prueba de notificaciones enviada",
          description: "La notificación de prueba se ha enviado correctamente. ¿La ves en tu navegador?",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error en prueba",
          description: "No se pudo enviar la notificación. Por favor, verifica los permisos de tu navegador.",
        });
      }
    } catch (error) {
      console.error("Error al probar notificaciones:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error al probar las notificaciones: " + error.message,
      });
    } finally {
      setTestingNotification(false);
    }
  };

  const simulateBinLevelChange = async (binId, newLevel) => {
    try {
      setIsLoading(true);
      
      // Buscar el bin actual para comparar
      const currentBin = trashBins.find(bin => bin.id === binId);
      if (!currentBin) {
        throw new Error("Basurero no encontrado");
      }
      
      const oldLevel = currentBin.fill_level;
      console.log(`Simulando cambio: Basurero "${currentBin.name}" de ${oldLevel}% a ${newLevel}%`);
      
      // Verificar si cruza algún umbral importante
      const willCross80 = oldLevel < 80 && newLevel >= 80;
      const willCross100 = oldLevel < 100 && newLevel >= 100;
      
      if (willCross80 || willCross100) {
        console.log(`⚠️ Esta simulación cruzará un umbral crítico (${willCross100 ? '100%' : '80%'})`);
      }
      
      // Actualizar el nivel en la base de datos
      const { error } = await supabase
        .from('trash_bins')
        .update({ 
          fill_level: newLevel,
          updated_at: new Date().toISOString()
        })
        .eq('id', binId);
        
      if (error) throw error;
      
      console.log("✅ Nivel actualizado correctamente en la base de datos");
      
      // Mostrar mensaje de éxito
      toast({
        title: "Simulación completada",
        description: `Nivel de basurero actualizado a ${newLevel}%`,
      });
      
      // La actualización debería disparar la suscripción automáticamente
      // Sin embargo, también forzamos una notificación inmediata si cruza un umbral
      if (willCross80 || willCross100) {
        setTimeout(async () => {
          console.log("Enviando notificación explícita por umbral cruzado...");
          
          const { sendNotification } = await import("@/lib/notificationService");
          const message = willCross100
            ? `🚨 ¡ALERTA CRÍTICA! El basurero ${currentBin.name} ha alcanzado su capacidad máxima (${newLevel}%). Requiere atención inmediata.`
            : `⚠️ El basurero ${currentBin.name} está alcanzando su capacidad máxima (${newLevel}%). Por favor planifique vaciarlo pronto.`;
            
          await sendNotification("TrashTracker Alerta", message);
        }, 1000);
      }
      
    } catch (error) {
      console.error("Error al simular cambio de nivel:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al simular cambio: " + error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let channel = null;

    const setup = async () => {
      try {
        await fetchTrashBins();
        channel = subscribeToUpdates();
        
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
      if (channel) {
        console.log("Limpiando suscripción a cambios en basureros...");
        channel.unsubscribe();
      }
    };
  }, []);

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
              onClick={testNotification}
              disabled={testingNotification}
            >
              {testingNotification ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Probando...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  Probar Notificaciones
                </>
              )}
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

                        {/* Botones de simulación */}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => simulateBinLevelChange(bin.id, 60)}
                          >
                            Simular 60%
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="bg-yellow-50 border-yellow-200"
                            onClick={() => simulateBinLevelChange(bin.id, 85)}
                          >
                            Simular 85%
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="bg-red-50 border-red-200"
                            onClick={() => simulateBinLevelChange(bin.id, 100)}
                          >
                            Simular 100%
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => simulateBinLevelChange(bin.id, 0)}
                          >
                            Vaciar (0%)
                          </Button>
                        </div>

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
                          <h4 className="font-semibold mb-2 text-gray-700">Últimos eventos:</h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {bin.events.slice(0, 5).map((event, index) => (
                              <div 
                                key={index} 
                                className="text-sm bg-white/50 rounded-lg p-2 flex items-center gap-2"
                              >
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                  {new Date(event.created_at).toLocaleTimeString()}
                                </span>
                                <span className="text-gray-700">{event.description}</span>
                              </div>
                            ))}
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

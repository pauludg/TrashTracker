import React, { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { User, Phone, Mail, ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"

function Profile() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user) {
      console.log("User metadata:", user.user_metadata)
      // Inicializar con datos del usuario actual
      setFullName(user.user_metadata?.full_name || "")
      setPhoneNumber(user.user_metadata?.phone_number || "")
      setIsLoading(false)
    }
  }, [user])

  const updateProfile = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          phone_number: phoneNumber
        }
      })

      if (error) throw error

      console.log("Perfil actualizado:", data)
      
      // Refrescar la sesión para actualizar el usuario
      const { data: sessionData } = await supabase.auth.refreshSession()
      console.log("Sesión actualizada:", sessionData)
      
      toast({
        title: "¡Perfil actualizado!",
        description: "Los cambios se han guardado correctamente.",
      })
    } catch (error) {
      console.error("Error al actualizar perfil:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al actualizar el perfil: " + error.message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al Panel
        </Button>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Perfil de Usuario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Correo Electrónico
              </label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-gray-50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Nombre Completo
              </label>
              <Input
                placeholder="Ingresa tu nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Número de Teléfono
              </label>
              <Input
                placeholder="Ingresa tu número de teléfono"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                type="tel"
              />
            </div>

            <Button
              className="w-full"
              onClick={updateProfile}
              disabled={isLoading}
            >
              Guardar Cambios
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Profile

// Command vapid genera un par de claves VAPID para los avisos al celular
// (Web Push, TR-179). Se corre UNA vez y las claves se cargan en las
// variables de entorno de la API:
//
//	cd apps/api && go run ./cmd/vapid
//
// Cambiarlas después invalida los avisos de todos los navegadores que ya
// los activaron: tendrían que volver a activarlos.
package main

import (
	"fmt"
	"log"

	"dental-mirage/api/internal/push"
)

func main() {
	publica, privada, err := push.GenerarClaves()
	if err != nil {
		log.Fatalf("no se pudieron generar las claves: %v", err)
	}
	fmt.Println("VAPID_PUBLIC_KEY=" + publica)
	fmt.Println("VAPID_PRIVATE_KEY=" + privada)
	fmt.Println("VAPID_SUBJECT=mailto:<un mail de contacto real>")
}

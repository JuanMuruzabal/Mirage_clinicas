package documentos

import (
	"bytes"
	"strings"
	"testing"
)

// Fase 5.6a: la página 2 de la Historia clínica para PcD se dibuja al 93 %
// dentro del A4 (arriba y centrada); el pie de la hoja queda afuera de la
// escala. La General v2, sin escala, no lleva ninguna matriz.

func plantillaDe(t *testing.T, id string, version int) *Plantilla {
	t.Helper()
	p, ok := PorID(id, version)
	if !ok {
		t.Fatalf("falta la plantilla %s v%d", id, version)
	}
	return p
}

func TestEncuadre_ConYSinEscala(t *testing.T) {
	if e, dx := (PaginaDeLamina{Ancho: 595.6, Alto: 842}).encuadre(); e != 1 || dx != 0 {
		t.Fatalf("sin escala: %v, %v", e, dx)
	}
	e, dx := (PaginaDeLamina{Ancho: 595.6, Alto: 842, Escala: 0.93}).encuadre()
	if e != 0.93 || dx < 20.845 || dx > 20.847 {
		t.Fatalf("con escala 0,93: %v, %v", e, dx)
	}
	pcd := plantillaDe(t, "historia-clinica-pcd", 1)
	if pcd.Lamina.Paginas[0].Escala != 0 || pcd.Lamina.Paginas[1].Escala != 0.93 {
		t.Fatalf("la PcD tiene que escalar solo la página 2: %+v", pcd.Lamina.Paginas)
	}
}

func TestGenerarPDF_PaginaEscaladaConElPieAfuera(t *testing.T) {
	p := plantillaDe(t, "historia-clinica-pcd", 1)
	f := selladoDePrueba(t, p, pacienteDePrueba)
	a := generarPDF(t, f)
	if b := generarPDF(t, f); !bytes.Equal(a, b) {
		t.Fatal("el PDF de la PcD no es determinista")
	}
	paginas := paginasDelPDF(t, a)
	if len(paginas) < 2 {
		t.Fatalf("%d hojas", len(paginas))
	}
	matriz := "q 0.93 0 0 0.93 20.846 58.94 cm\n"
	if strings.Contains(paginas[0], " cm\n") {
		t.Error("la página 1 de la PcD no tiene escala y no lleva matriz")
	}
	pag := paginas[1]
	i := strings.Index(pag, matriz)
	if i < 0 {
		t.Fatalf("la página 2 no lleva la matriz %q", matriz)
	}
	// El pie va después de la matriz, con el estado gráfico ya cerrado
	// (tantos q como Q antes de él): se dibuja en la hoja, sin escalar.
	pie := strings.LastIndex(pag, "Folio 7")
	if pie < i {
		t.Fatal("el pie tiene que ir después de lo escalado")
	}
	abiertos := 0
	for _, l := range strings.Split(pag[:pie], "\n") {
		if strings.HasPrefix(l, "BT ") {
			continue // un texto: lo que haya en su cadena no son operadores
		}
		for _, op := range strings.Fields(l) {
			switch op {
			case "q":
				abiertos++
			case "Q":
				abiertos--
			}
		}
	}
	if abiertos != 0 {
		t.Fatalf("el pie quedó adentro de %d estados gráficos abiertos", abiertos)
	}
}

func TestGenerarPDF_SinEscalaNoLlevaMatriz(t *testing.T) {
	for _, pv := range []struct {
		id      string
		version int
	}{{"historia-clinica-general", 1}, {"historia-clinica-general", 2}, {"consentimiento-tratamiento-conducto", 1}} {
		p := plantillaDe(t, pv.id, pv.version)
		for n, pag := range paginasDelPDF(t, generarPDF(t, selladoDePrueba(t, p, pacienteDePrueba))) {
			if strings.Contains(pag, " cm\n") {
				t.Errorf("%s v%d hoja %d: sin escala no tiene que haber matriz", pv.id, pv.version, n+1)
			}
		}
	}
}

func TestOriginales_LaGeneralV2UsaLasPaginasDeLaV1(t *testing.T) {
	v1 := plantillaDe(t, "historia-clinica-general", 1)
	for n := 1; n <= len(v1.Lamina.Paginas); n++ {
		a, okA := PaginaOriginal("historia-clinica-general", 1, n)
		b, okB := PaginaOriginal("historia-clinica-general", 2, n)
		if !okA || !okB || !bytes.Equal(a, b) {
			t.Errorf("pág. %d: la General v2 no dibuja sobre el original de la v1", n)
		}
	}
	if _, ok := PaginaOriginal("historia-clinica-general", 3, 1); ok {
		t.Error("una versión que no existe no tiene original")
	}
	if u, ok := Ultima("historia-clinica-general"); !ok || u.Version != 2 {
		t.Fatalf("la vigente de la General tiene que ser la 2: %+v", u)
	}
}

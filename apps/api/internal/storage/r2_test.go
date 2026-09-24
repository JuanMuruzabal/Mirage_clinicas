package storage_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"dental-mirage/api/internal/storage"
)

// s3Falso — lo mínimo de la API S3 que usa R2Storage (PUT y GET de un
// objeto, estilo path: /<bucket>/<clave>), en memoria. Anota las cabeceras
// del último PUT para verificar lo que se manda a R2.
type s3Falso struct {
	mu        sync.Mutex
	objetos   map[string][]byte
	ultimoPut http.Header
	fallar    bool
}

func (f *s3Falso) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fallar {
		// 403 y no 500: el SDK reintenta los 5xx con espera, y el test
		// solo quiere ver que el error no se confunde con "no existe".
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>credenciales revocadas</Message></Error>`)
		return
	}
	if r.Header.Get("Authorization") == "" {
		http.Error(w, "sin firma", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodPut:
		datos, _ := io.ReadAll(r.Body)
		f.objetos[r.URL.Path] = datos
		f.ultimoPut = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
	case http.MethodGet:
		datos, ok := f.objetos[r.URL.Path]
		if !ok {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusNotFound)
			_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>no existe</Message></Error>`)
			return
		}
		_, _ = w.Write(datos)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func nuevoR2DePrueba(t *testing.T) (*storage.R2Storage, *s3Falso) {
	t.Helper()
	falso := &s3Falso{objetos: map[string][]byte{}}
	srv := httptest.NewServer(falso)
	t.Cleanup(srv.Close)
	s, err := storage.NewR2Storage(storage.R2Config{
		Bucket: "fotos", Endpoint: srv.URL, AccessKey: "clave", SecretKey: "secreto",
	}, "/uploads/")
	if err != nil {
		t.Fatalf("NewR2Storage: %v", err)
	}
	return s, falso
}

// TestR2Storage_SaveSubeAlBucketYDevuelveLaURLRelativa — TR-167: la URL es
// la misma relativa que la del disco local; el bucket no se expone.
func TestR2Storage_SaveSubeAlBucketYDevuelveLaURLRelativa(t *testing.T) {
	s, falso := nuevoR2DePrueba(t)

	url, err := s.Save(context.Background(), "tok.w960.webp", strings.NewReader("imagen"))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if url != "/uploads/tok.w960.webp" {
		t.Errorf("url = %q, esperaba /uploads/tok.w960.webp", url)
	}
	if got := string(falso.objetos["/fotos/tok.w960.webp"]); got != "imagen" {
		t.Errorf("objeto en el bucket = %q, esperaba %q (claves: %v)", got, "imagen", falso.objetos)
	}
	if ct := falso.ultimoPut.Get("Content-Type"); ct != "image/webp" {
		t.Errorf("Content-Type del PUT = %q, esperaba image/webp", ct)
	}
	if cc := falso.ultimoPut.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("Cache-Control del PUT = %q, esperaba immutable", cc)
	}
}

func TestR2Storage_OpenLeeLoQueSeGuardo(t *testing.T) {
	s, _ := nuevoR2DePrueba(t)
	if _, err := s.Save(context.Background(), "tok.jpg", strings.NewReader("jpeg")); err != nil {
		t.Fatalf("Save: %v", err)
	}

	contenido, largo, err := s.Open(context.Background(), "tok.jpg")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = contenido.Close() }()
	datos, _ := io.ReadAll(contenido)
	if string(datos) != "jpeg" || largo != 4 {
		t.Errorf("Open = %q (largo %d), esperaba %q (4)", datos, largo, "jpeg")
	}
}

func TestR2Storage_OpenDeUnaClaveInexistenteEsErrNoExiste(t *testing.T) {
	s, _ := nuevoR2DePrueba(t)
	if _, _, err := s.Open(context.Background(), "noexiste.jpg"); !errors.Is(err, storage.ErrNoExiste) {
		t.Errorf("err = %v, esperaba ErrNoExiste", err)
	}
}

// TestR2Storage_ErrorDelBucketNoSeConfundeConNoExiste — un R2 que rechaza
// (credenciales revocadas, bucket caído) no es "la foto no existe": el
// handler tiene que poder distinguirlo (502 vs 404).
func TestR2Storage_ErrorDelBucketNoSeConfundeConNoExiste(t *testing.T) {
	s, falso := nuevoR2DePrueba(t)
	falso.fallar = true
	ctx := context.Background()

	if _, _, err := s.Open(ctx, "tok.jpg"); err == nil || errors.Is(err, storage.ErrNoExiste) {
		t.Errorf("Open: err = %v, esperaba un error distinto de ErrNoExiste", err)
	}
	if _, err := s.Save(ctx, "tok.jpg", strings.NewReader("x")); err == nil {
		t.Error("Save: esperaba un error con el bucket caído")
	}
}

// TestR2Storage_SaveIgnoraElPathDelNombre — mismo criterio que el disco
// local: un nombre nunca arma una clave en otra "carpeta" del bucket.
func TestR2Storage_SaveIgnoraElPathDelNombre(t *testing.T) {
	s, falso := nuevoR2DePrueba(t)
	url, err := s.Save(context.Background(), `../otra\tok.png`, strings.NewReader("x"))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if url != "/uploads/tok.png" {
		t.Errorf("url = %q, esperaba /uploads/tok.png", url)
	}
	if _, ok := falso.objetos["/fotos/tok.png"]; !ok {
		t.Errorf("esperaba la clave tok.png en la raíz del bucket, hay: %v", falso.objetos)
	}
}

func TestNewR2Storage_ConfiguracionIncompletaFallaDiciendoQueFalta(t *testing.T) {
	_, err := storage.NewR2Storage(storage.R2Config{Bucket: "fotos", AccessKey: "clave"}, "/uploads")
	if err == nil {
		t.Fatal("esperaba un error con la configuración incompleta")
	}
	for _, falta := range []string{"STORAGE_R2_ENDPOINT", "STORAGE_R2_SECRET_KEY"} {
		if !strings.Contains(err.Error(), falta) {
			t.Errorf("el error %q debería nombrar %s", err, falta)
		}
	}
	if strings.Contains(err.Error(), "STORAGE_R2_BUCKET") {
		t.Errorf("el error %q nombra una variable que sí está", err)
	}
}

package storage_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
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
	case http.MethodDelete:
		delete(f.objetos, r.URL.Path)
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		// ListObjectsV2 (PP-7): GET /<bucket>?list-type=2, en una sola página.
		if r.URL.Query().Get("list-type") == "2" {
			prefijo := r.URL.Path + "/"
			var claves strings.Builder
			for ruta := range f.objetos {
				if strings.HasPrefix(ruta, prefijo) {
					fmt.Fprintf(&claves, "<Contents><Key>%s</Key><LastModified>2026-09-01T12:00:00.000Z</LastModified><Size>1</Size></Contents>", strings.TrimPrefix(ruta, prefijo))
				}
			}
			w.Header().Set("Content-Type", "application/xml")
			_, _ = fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>fotos</Name><IsTruncated>false</IsTruncated>%s</ListBucketResult>`, claves.String())
			return
		}
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

// List y Delete (PP-7, H22): la limpieza diaria de fotos huérfanas recorre
// el bucket y borra lo que nadie usa. List ignora lo que no tiene forma de
// foto subida: el bucket podría tener otra cosa y no es de esta app.
func TestR2Storage_ListYDelete(t *testing.T) {
	s, falso := nuevoR2DePrueba(t)
	ctx := context.Background()
	for _, nombre := range []string{"tok.w480.webp", "otro.jpg"} {
		if _, err := s.Save(ctx, nombre, strings.NewReader("x")); err != nil {
			t.Fatalf("Save: %v", err)
		}
	}
	falso.objetos["/fotos/respaldo.sql"] = []byte("no es una foto")

	archivos, err := s.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var nombres []string
	for _, a := range archivos {
		nombres = append(nombres, a.Nombre)
		if a.Modificado.IsZero() {
			t.Errorf("%s sin fecha de modificación", a.Nombre)
		}
	}
	sort.Strings(nombres)
	if strings.Join(nombres, ",") != "otro.jpg,tok.w480.webp" {
		t.Errorf("List = %v, esperaba otro.jpg y tok.w480.webp", nombres)
	}

	if err := s.Delete(ctx, "otro.jpg"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, ok := falso.objetos["/fotos/otro.jpg"]; ok {
		t.Error("Delete no borró el objeto")
	}
	if err := s.Delete(ctx, "ya-no-esta.jpg"); err != nil {
		t.Errorf("borrar algo que no existe no es un error: %v", err)
	}
}

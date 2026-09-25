package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// R2Config — las credenciales de un bucket de Cloudflare R2 (API S3).
// Endpoint es el de la cuenta: https://<account_id>.r2.cloudflarestorage.com.
type R2Config struct {
	Bucket    string
	Endpoint  string
	AccessKey string
	SecretKey string
	// Region vacía = "auto", que es lo que espera R2.
	Region string
}

// R2Storage guarda en un bucket PRIVADO de R2. La URL que devuelve Save es
// la misma relativa que la de LocalStorage (PublicURLBase + nombre): el
// archivo no se sirve desde R2 sino desde la web, que se lo pide a la API,
// que lo lee con Open (TR-167). Así no hace falta ni un dominio para el
// bucket ni abrir la CSP a otro origen, y las URLs guardadas en la base no
// dependen de dónde vivan los archivos.
//
// La clave del objeto es el nombre tal cual, sin carpetas: el nombre es un
// token aleatorio (no adivinable, no choca) y la ruta /uploads de la web solo
// acepta nombres planos.
type R2Storage struct {
	client        *s3.Client
	bucket        string
	PublicURLBase string
}

func NewR2Storage(cfg R2Config, publicURLBase string) (*R2Storage, error) {
	var faltan []string
	for _, campo := range []struct{ nombre, valor string }{
		{"STORAGE_R2_BUCKET", cfg.Bucket},
		{"STORAGE_R2_ENDPOINT", cfg.Endpoint},
		{"STORAGE_R2_ACCESS_KEY", cfg.AccessKey},
		{"STORAGE_R2_SECRET_KEY", cfg.SecretKey},
	} {
		if strings.TrimSpace(campo.valor) == "" {
			faltan = append(faltan, campo.nombre)
		}
	}
	if len(faltan) > 0 {
		return nil, fmt.Errorf("storage R2 a medio configurar, faltan: %s", strings.Join(faltan, ", "))
	}
	region := cfg.Region
	if region == "" {
		region = "auto"
	}

	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(strings.TrimSuffix(cfg.Endpoint, "/")),
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		// R2 no acepta el estilo virtual-host con el endpoint de la cuenta.
		UsePathStyle: true,
		// Desde s3 v1.73 el SDK agrega checksums CRC32 en cada PUT y los
		// valida en cada GET; Cloudflare recomienda pedirlos solo cuando la
		// operación los exige.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &R2Storage{
		client:        client,
		bucket:        cfg.Bucket,
		PublicURLBase: strings.TrimSuffix(publicURLBase, "/"),
	}, nil
}

func (s *R2Storage) Save(ctx context.Context, filename string, r io.Reader) (string, error) {
	nombre := nombreSeguro(filename)
	// El SDK firma el cuerpo, y para eso necesita poder releerlo: una foto
	// ya viene acotada a 5 MB por el handler, así que se lee entera.
	datos, err := io.ReadAll(r)
	if err != nil {
		return "", fmt.Errorf("no se pudo leer el archivo: %w", err)
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(nombre),
		Body:          bytes.NewReader(datos),
		ContentLength: aws.Int64(int64(len(datos))),
		ContentType:   aws.String(ContentTypeDe(nombre)),
		// El contenido de un nombre no cambia nunca: una foto nueva es un
		// nombre nuevo.
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	})
	if err != nil {
		return "", fmt.Errorf("no se pudo subir el archivo a R2: %w", err)
	}
	return s.PublicURLBase + "/" + nombre, nil
}

func (s *R2Storage) Open(ctx context.Context, filename string) (io.ReadCloser, int64, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(nombreSeguro(filename)),
	})
	if err != nil {
		if esNoEncontrado(err) {
			return nil, 0, ErrNoExiste
		}
		return nil, 0, fmt.Errorf("no se pudo leer el archivo de R2: %w", err)
	}
	largo := int64(-1)
	if out.ContentLength != nil {
		largo = *out.ContentLength
	}
	return out.Body, largo, nil
}

// nombreSeguro — mismo criterio que LocalStorage (filepath.Base): lo que
// venga antes de la última barra se descarta, para que un nombre nunca
// arme una clave en otra "carpeta" del bucket.
func nombreSeguro(filename string) string {
	if i := strings.LastIndexAny(filename, `/\`); i >= 0 {
		return filename[i+1:]
	}
	return filename
}

func esNoEncontrado(err error) bool {
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return true
	}
	var respErr *awshttp.ResponseError
	return errors.As(err, &respErr) && respErr.HTTPStatusCode() == http.StatusNotFound
}

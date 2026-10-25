package http

import (
	"net"
	"net/http/httptest"
	"strings"
	"testing"
)

// esIPPublica es el mismo criterio que ipPublica, escrito aparte para que
// el fuzzer lo compare contra el resultado.
func esIPPublica(t *testing.T, valor string) {
	t.Helper()
	ip := net.ParseIP(valor)
	if ip == nil {
		t.Fatalf("%q se dio por IP pública y no parsea", valor)
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		t.Fatalf("%q se dio por IP pública y es de infraestructura", valor)
	}
}

var semillasDeIP = []string{
	"203.0.113.7",
	"8.8.8.8",
	"10.29.215.4",
	"192.168.1.1",
	"172.16.0.1",
	"127.0.0.1",
	"0.0.0.0",
	"2001:4860:4860::8888",
	"fe80::1",
	"::1",
	"::",
	"  8.8.4.4  ",
	"\t1.1.1.1\n",
	"no-es-una-ip",
	"",
	"::ffff:10.0.0.1",
	"8.8.8.8%eth0",
	"999.1.1.1",
}

func FuzzIPPublica(f *testing.F) {
	for _, s := range semillasDeIP {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, valor string) {
		got := ipPublica(valor)
		if got == "" {
			return
		}
		if got != strings.TrimSpace(valor) {
			t.Fatalf("ipPublica(%q) = %q, se esperaba el valor sin espacios", valor, got)
		}
		esIPPublica(t, got)
	})
}

func FuzzClientIPConFuente(f *testing.F) {
	f.Add("", "")
	f.Add("203.0.113.7", "")
	f.Add("", "203.0.113.7, 10.0.0.1")
	f.Add("10.0.0.1", "8.8.8.8,192.168.0.1,10.29.215.4")
	f.Add("127.0.0.1", "10.0.0.1, 192.168.1.1")
	f.Add("basura", ",,,")
	f.Add("", " ")
	f.Add("2001:db8::1", "fe80::1, 2001:4860::1")
	for _, s := range semillasDeIP {
		f.Add(s, s)
	}
	f.Fuzz(func(t *testing.T, cf, xff string) {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = "192.0.2.10:54321"
		if cf != "" {
			r.Header.Set("CF-Connecting-IP", cf)
		}
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		ip, fuente := clientIPConFuente(r)
		switch fuente {
		case "cf", "xff":
			esIPPublica(t, ip)
		case "xff-interna":
		case "remote":
			if ip != "192.0.2.10" {
				t.Fatalf("fuente remote con IP %q, se esperaba la del RemoteAddr", ip)
			}
		default:
			t.Fatalf("fuente inesperada %q (cf=%q, xff=%q)", fuente, cf, xff)
		}
		if cf == "" && xff == "" && fuente != "remote" {
			t.Fatalf("sin cabeceras la fuente debería ser remote, fue %q", fuente)
		}
	})
}

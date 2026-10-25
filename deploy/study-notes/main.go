// Command studynotes serves the embedded study-notes page on a loopback port.
// Caddy terminates TLS and proxies the public hostname to it.
package main

import (
	_ "embed"
	"flag"
	"log"
	"net/http"
	"time"
)

//go:embed index.html
var page []byte

func main() {
	addr := flag.String("addr", "127.0.0.1:8430", "listen address")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		h.Set("X-Content-Type-Options", "nosniff")
		w.Write(page)
	})

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("study-notes listening on %s", *addr)
	log.Fatal(srv.ListenAndServe())
}

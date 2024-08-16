package main

import (
	"api/internal/auth"
	"api/internal/server"
	"fmt"
)

func main() {

	auth.InitAuth()

	server := server.NewServer()

	err := server.ListenAndServe()
	if err != nil {
		panic(fmt.Sprintf("cannot start server: %s", err))
	}
}

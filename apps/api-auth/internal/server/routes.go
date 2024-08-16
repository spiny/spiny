package server

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)


type Router struct {}


func (s *Server) RegisterRoutes() http.Handler {
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())  // debug

  r := new(Router)

  //e.GET("/", s.HelloWorldHandler)
  e.GET("/", r.HelloWorldHandler(s))
  
  e.GET("/status/db", r.DbHealthHandler(s))

  // TODO: use a rate limiter (https://echo.labstack.com/docs/middleware/rate-limiter)

  e.GET("/session", s.authSessionHandler)
	e.GET("/sign-in/:provider", s.authProviderHandler)
	e.GET("/sign-in/:provider/callback", s.authProviderCallbackHandler)
	e.GET("/sign-out/:provider", s.authProviderLogoutHandler)

	return e
}



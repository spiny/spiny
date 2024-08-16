package server

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)


func (s *Server) SaveRedirection(c echo.Context, url string) {
  cookie := new(http.Cookie)
	cookie.Name = "redirect"
	cookie.Value = url
  cookie.Expires = time.Now().Add(15 * time.Minute)
	c.SetCookie(cookie)
}


func (s *Server) ReadRedirection(c echo.Context) string {
	if cookie, err := c.Cookie("redirect"); err != nil {
    return ""
  } else {
    return cookie.Value
  }
}


func (s *Server) ResetRedirection(c echo.Context) {
  cookie := new(http.Cookie)
	cookie.Name = "redirect"
	cookie.Value = ""
  cookie.Expires = time.Unix(0, 0)
	c.SetCookie(cookie)
}

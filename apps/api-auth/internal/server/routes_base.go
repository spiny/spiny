package server

import (
	"net/http"

	"github.com/labstack/echo/v4"
)




func (r *Router) HelloWorldHandler(s *Server) echo.HandlerFunc {
  return func(c echo.Context) error {
    resp := map[string]string{
      "message": "Hello World",
    }

    return c.JSON(http.StatusOK, resp)
  }
}


// func (s *Server) setRedirectHandler(c echo.Context) error {
//   redirect := c.QueryParam("redirect")
// 
//   s.SaveRedirection(c, redirect)
// 
//   return c.JSON(http.StatusOK, map[string]string{
//     "status": "ok",
//   })
// }

// func (s *Server) getRedirectHandler(c echo.Context) error {
//   redirect := s.ReadRedirection(c)
// 
//   return c.JSON(http.StatusOK, map[string]string{
//     "status": "ok",
//     "redirect": redirect,
//   })
// }


func (r *Router) DbHealthHandler(s *Server) echo.HandlerFunc {
  return func(c echo.Context) error {
    return c.JSON(http.StatusOK, s.db.Health())
  }
}



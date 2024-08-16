package auth

import (
	"fmt"
	"os"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	echojwt "github.com/labstack/echo-jwt/v4"
	"github.com/markbates/goth"
)

var (
  jwtSecret = os.Getenv("JWT_SECRET")
)


// jwtCustomClaims are custom claims extending default ones.
// See https://github.com/golang-jwt/jwt for more examples
type JwtAuthClaims struct {
	UserID  string `json:"uid"`
	// add more fields if needed
	jwt.RegisteredClaims
}


// 
func GenerateAuthToken(user goth.User) (string, error) {
  claims := &JwtAuthClaims{
		user.UserID,
		jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(user.ExpiresAt),
		},
	}

	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

  // Sign and get the complete encoded token as a string using the secret
	return token.SignedString(jwtSecret)
}

// Validate the token and return the found user id, or an empty string if
// the token is invalid 
func ValidateToken(tokenString string) string {
  token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
    if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
      return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
    }
    return jwtSecret, nil
  })

  if err != nil {
    return ""
  } else if claims, ok := token.Claims.(JwtAuthClaims); ok && token.Valid {
    return claims.UserID
  } else {
    return ""
  }
}

// Returns the middleware to use in protected routes
// the Echo Context will receive the "user" property
//    user := c.Get("user").(*jwt.Token)
//    claims := user.Claims.(*auth.JwtAuthClaims)
//    userId := claims.UserID
func Middleware() echo.MiddlewareFunc {
	config := echojwt.Config{
		NewClaimsFunc: func(c echo.Context) jwt.Claims {
			return new(JwtAuthClaims)
		},
		SigningKey: jwtSecret,
	}
  
	return echojwt.WithConfig(config)
}

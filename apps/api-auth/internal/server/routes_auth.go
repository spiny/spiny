package server

import (
	"api/internal/model"
	"api/internal/server/auth"
	"api/internal/url"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"gorm.io/gorm/clause"
)

var (
  jwtSecret = os.Getenv("JWT_SECRET")

  // ex: /auth/login/azure  will map to azureadv2 provider
  providerMap = map[string]string{
    "azure": "azureadv2",
  }
)


func getProviderRequest(c echo.Context) (*http.Request, *echo.Response) {
	provider := c.Param("provider")
	req := c.Request()
	res := c.Response()
	
  if alias, found := providerMap[provider]; found {
    provider = alias
  } 

	ctx := context.WithValue(req.Context(), gothic.ProviderParamKey, provider)

	return req.WithContext(ctx), res
}

func getRedirection(c echo.Context) string {
  redirect := c.QueryParam("redirect")
  
  if len(redirect) == 0 {
    redirect = c.Request().URL.String()
  }

  return redirect
}
 

func getAuthUserModel(user goth.User) model.AuthUser {
  return model.AuthUser{
    UserID: user.UserID,
    FirstName: user.FirstName,
    LastName: user.LastName,
    Email: user.LastName,
    AvatarURL: user.AvatarURL,
    AccessToken: user.AccessToken,
    AccessTokenSecret: user.AccessTokenSecret,
    RefreshToken: user.RefreshToken,
    ExpiresAt: user.ExpiresAt,
  }
}


// func generateAuthToken(user goth.User) (string, error) {
//	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
//		"userId": user.UserID,
//		"exp": user.ExpiresAt,
//	})
//
//	// Sign and get the complete encoded token as a string using the secret
//	return token.SignedString(jwtSecret)
//}

//func validateToken(tokenString string) string {
//  token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
//    if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
//      return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
//    }
//    return jwtSecret, nil
//  })
//
//  if err != nil {
//    return ""
//  } else if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
//    return claims["userId"].(string)
//  } else {
//    return ""
//  }
//}



// 1. Request user authentication
//    * returns or redirects with auth token if found
//    * perform auth with specified provider otherwise
//
// URL Params:
//   - :provider
//   - ?redirect=URL
func (s *Server) authProviderHandler(c echo.Context) error {
	req, res := getProviderRequest(c)
  redirect := getRedirection(c)

	// try to get the user without re-authenticating
	if user, err := gothic.CompleteUserAuth(res, req); err == nil {
    s.ResetRedirection(c)

    authToken, tokenErr := auth.GenerateAuthToken(user)
    if tokenErr != nil {
      log.Printf("error generating auth token: %v", tokenErr)
      return tokenErr
    }

    if len(redirect) > 0 {
      redirect, _ = url.AppendQueryParam(redirect, "token", authToken)

      return c.Redirect(http.StatusTemporaryRedirect, redirect)
    } else {
      return c.JSON(http.StatusOK, map[string]string{
        "token": authToken,
      })
    }
  } else {
    s.SaveRedirection(c, redirect)

    gothic.BeginAuthHandler(res, req)
		return nil
	}
}

// 2. Authentication callback
//    * returns or redirects with auth token
//
// URL Params:
//   - :provider
func (s *Server) authProviderCallbackHandler(c echo.Context) error {
	req, res := getProviderRequest(c)

	user, authErr := gothic.CompleteUserAuth(res, req)
	if authErr != nil {
    log.Printf("authentication error: %v", authErr)
		return authErr
	}

  redirect := s.ReadRedirection(c)
  authUser := getAuthUserModel(user)

  s.db.Get().Clauses(clause.OnConflict{
    UpdateAll: true,
  }).Create(&authUser)

  s.ResetRedirection(c)

  authToken, tokenErr := auth.GenerateAuthToken(user)
  if tokenErr != nil {
    log.Printf("error generating auth token: %v", tokenErr)
    return tokenErr
  }

  if len(redirect) > 0 {
    redirect, _ = url.AppendQueryParam(redirect, "token", authToken)

    return c.Redirect(http.StatusTemporaryRedirect, redirect)
  } else {
    return c.JSON(http.StatusOK, map[string]string{
      "token": authToken,
    })
  }
}

// Invalidate user session
//
// URL Params:
//   - ?redirect=URL
func (s *Server) authProviderLogoutHandler(c echo.Context) error {
	req, res := getProviderRequest(c)
  redirect := getRedirection(c)
  
	gothic.Logout(res, req)

  s.ResetRedirection(c)

  if len(redirect) > 0 {
    return c.Redirect(http.StatusTemporaryRedirect, redirect);
  } else {
  	return c.HTML(http.StatusOK, "Logout successful")
  }
}

// Get the current user from auth token
//
// URL Params
//   - ?token=string
func (s *Server) authSessionHandler(c echo.Context) error {
  var authUser model.AuthUser

  authToken := c.QueryParam("token")

  if len(authToken) == 0 {
    return fmt.Errorf("missing token")
  }

  userId := auth.ValidateToken(authToken)
  if len(userId) == 0 {
    return fmt.Errorf("invalid token")
  }

  s.db.Get().Where("UserID = ?", userId).First(&authUser)
  
  return c.JSON(http.StatusOK, authUser)
}

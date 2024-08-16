package auth

import (
	"log"
	"os"

	"github.com/gorilla/sessions"
	"github.com/joho/godotenv"

	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	// "github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/azureadv2"
)

const (
	key    = "secretKey"
	maxAge = 86400 * 30 // 30 days
	isProd = false      // change this for environment context
)

func InitAuth() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	// googleClientId := os.Getenv("GOOGLE_CLIENT_ID")
	// googleClientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	// googleRedirectUri := os.Getenv("GOOGLE_REDIRECT_URI")

	azureClientId := os.Getenv("AZURE_CLIENT_ID");
	azureClientSecret := os.Getenv("AZURE_CLIENT_SECRET");
	azureTenantId := os.Getenv("AZURE_TENANT_ID");
	azureRedirectUri := os.Getenv("AZURE_REDIRECT_URI");
	
	store := sessions.NewCookieStore([]byte(key))
	store.MaxAge(maxAge)

	store.Options.Path = "/"
	store.Options.HttpOnly = true
	store.Options.Secure = isProd

	gothic.Store = store

	goth.UseProviders(
		// google.New(googleClientId, googleClientSecret, googleRedirectUri),
		azureadv2.New(azureClientId, azureClientSecret, azureRedirectUri,  azureadv2.ProviderOptions{
			Tenant: azureadv2.TenantType(azureTenantId),
		}),
	)
}

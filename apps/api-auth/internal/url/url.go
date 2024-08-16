package url

import "net/url"

// Make    http://domain.com?foo=123   + "bar", "hello"
// Become  http://domain.com?foo=123&bar=hello
func AppendQueryParam(baseURL string, param string, paramValue string) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Add(param, paramValue)
	u.RawQuery = q.Encode()

	return u.String(), nil
}

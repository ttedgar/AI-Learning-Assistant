package com.edi.backend.controller;

import com.edi.backend.dto.AuthSyncRequest;
import com.edi.backend.dto.DocumentResponse;
import com.edi.backend.entity.User;
import com.edi.backend.security.AuthenticatedUser;
import com.edi.backend.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Handles post-authentication user synchronisation.
 *
 * <p>After the frontend completes the Supabase OAuth flow, it calls this endpoint
 * to ensure the user has a local record in our database. The backend cannot receive
 * the Supabase auth callback directly, so this sync step is the frontend's responsibility.
 */
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth", description = "User synchronisation after Supabase OAuth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/sync")
    @Operation(summary = "Sync Supabase user into local DB",
               description = "Upserts the authenticated Supabase user into the local users table. " +
                             "Idempotent — safe to call on every login.")
    public ResponseEntity<Map<String, UUID>> sync(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AuthSyncRequest request) {

        User user = authService.syncUser(request.supabaseUserId(), request.email());
        return ResponseEntity.ok(Map.of("userId", user.getId()));
    }
}

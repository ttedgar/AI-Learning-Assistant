# Multi-stage build — compile in a JDK image, run in a slimmer JRE image.
# Production note: use a distroless or hardened base image for the runtime stage
# to reduce attack surface (e.g. gcr.io/distroless/java17-debian12).

FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY gradlew .
COPY gradle gradle
COPY build.gradle settings.gradle ./
COPY src src
RUN sed -i 's/\r//' gradlew && chmod +x gradlew && ./gradlew bootJar -x test --no-daemon

FROM eclipse-temurin:17-jre-alpine AS runtime
WORKDIR /app

# Run as non-root (principle of least privilege)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
